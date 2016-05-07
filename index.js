'use strict'

/**
 * Provide an event that contains an array of objects with the following keys:
 *
 *   - configMode: type of routing. It can be either `path` or `host`.
 *           In `path` mode, the URL path is used to determine which backend to forward the request to.
 *           In `host` mode, the HTTP host header is used to determine which backend to forward the request to.
 *           Defaults to `host` mode.
 *   - serviceName: name of service the containers belong to.
 *   - predicate: value used along with mode to determine which service a request will be forwarded to.
 *                `path` mode example: `acl <cluster> url_beg /<predicate>`.
 *                `host` mode example: `acl <cluster> hdr(host) -i <predicate>`.
 *   - cookie: name of cookie to be used for sticky sessions. If not defined, sticky sessions will not be configured.
 *   - containers: key-value pairs of container ids and their corresponding IP addresses.
 *
 * Visit sample-data directory for sample payloads.
 *
 */

const nunjucks = require('nunjucks')
const Joi = require('joi')
const Q = require('kew')
const DynamoDB = createDynamoDB()

const Service = DynamoDB.define('Service', {
  hashKey: 'serviceName',
  timestamps: true,
  schema: {
    serviceName: Joi.string(),
    configMode: Joi.string(),
    cookie: Joi.string(),
    predicate: Joi.string(),
    containers: Joi.array().items(Joi.object().keys({
      id: Joi.string(),
      ip: Joi.string()
    }))
  }
})

/**
 * Creates a vogels DynamoDB client configured based on the environment.
 *
 * @returns {*|exports|module.exports}
 */
function createDynamoDB () {
  const vogels = require('vogels')

  if (process.env.NODE_ENV === 'development') {
    vogels.AWS.config.update({
      endpoint: 'http://docker:8000',
      region: 'us-east-1'
    })
  }
  else
    vogels.AWS.config.update({
      region: 'us-east-1'
    })

  return vogels
}

function Cosmos () {}

/**
 * Create table if it does not exist already.
 * @returns {*}
 */
Cosmos.prototype.maybeCreateTable = () => {
  const defer = Q.defer()

  const createCallback = (err) => {
    if (err)
      console.log(err, err.stack)
    else
      defer.resolve('Table created.')
  }

  const describeCallback = (err, data) => {
    if (err)
      if (err.code === 'ResourceNotFoundException')
        DynamoDB.createTables({
          'Cluster': {readCapacity: 1, writeCapacity: 1}
        }, createCallback)
      else
        defer.reject(new Error('Describe table failed.'))
    else
      defer.resolve('Table exists.')
  }

  Service.describeTable(describeCallback)

  return defer.promise
}

/**
 * Get all values in table.
 *
 * @returns {!Promise}
 */
Cosmos.prototype.scanTable = () => {
  const defer = Q.defer()

  Service
    .scan()
    .loadAll()
    .exec(defer.makeNodeResolver())

  return defer
}

/**
 * Deduplicate an array.
 *
 * Source: https://gist.github.com/a-r-d/fb033b01b31d5246e82c
 *
 * @param arr
 * @returns {Array}
 */
Cosmos.prototype.dedupe = (arr) => {
  let tmpMap = {}
  arr.forEach( val => {
    let uniquekey = ''
    for (var k in val) {
      if (val.hasOwnProperty(k) && val[k]) {
        uniquekey += val[k].toString()
      }
    }
    tmpMap[uniquekey] = val
  })
  let deduped = []
  for (var key in tmpMap) {
    deduped.push(tmpMap[key])
  }
  return deduped
}

/**
 * Cleanse data retrieved from store so it does not contain services and containers that no longer exist.
 *
 * @param storedData Config from DB.
 * @param liveData Config from Lambda event.
 */
Cosmos.prototype.cleanse = (storedData, liveData) => {
  let storedServices = storedData.Items.map(item => item.attrs) // []

  storedServices = storedServices.length > 0 ?
    !Array.isArray(storedServices[0]) ?
      [storedServices[0]]
      : storedServices[0]
    : []

  if (!Array.isArray(storedServices)) {
    storedServices = [storedServices]
  }

  const getLiveServicesAttributeSet = (attr) => new Set(liveData.runningServices.map(i => i[attr]))
  const isServiceAvailable = i => getLiveServicesAttributeSet('serviceName').has(i.serviceName)
  const isContainerAvailable = i => getLiveServicesAttributeSet('id').has(i.id)

  console.log(storedServices)

  const availableServices = storedServices.filter(isServiceAvailable)
  availableServices.forEach(i => i.containers = i.containers.filter(isContainerAvailable))

  const unavailableServices = storedServices.filter(i => !isServiceAvailable(i))

  return { unavailableServices, availableServices }
}


Cosmos.prototype.persistCleanseOutcome = (services) => {
  const deferreds = services.unavailableServices.map(i => {
    let defer = Q.defer()
    Service.destroy(i, defer.makeNodeResolver())
    return defer
  })

  return Q.all(deferreds)
    .then((content) => services.availableServices)
}

/**
 * Merge both data structures so that the one returned contains a set of containers from both.
 *
 * @param updatedServices Cleansed services data from DB.
 * @param liveData Config from Lambda event.
 * @returns {*}
 */
Cosmos.prototype.merge = (updatedServices, liveData) => {
  const storedServices = new Set(updatedServices.map(i => i.serviceName))

  const doesStoredServicesContainService = i => storedServices.has(i.serviceName)
  const filterCandidateServices = fn => liveData.candidateServices.filter(fn)

  const existingServices = filterCandidateServices(doesStoredServicesContainService)
  const newServices = filterCandidateServices(i => !doesStoredServicesContainService(i))
  const containersTiedToExistingServices = liveData.runningServices.filter(doesStoredServicesContainService)

  updatedServices.forEach(i => {
    existingServices.forEach(j => {
      if (i.serviceName === j.serviceName)
        i.containers = i.containers.concat(j.containers)
    })

    containersTiedToExistingServices.forEach(j => {
      if (i.serviceName === j.serviceName)
        i.containers = i.containers.concat({
          id: j.id,
          ip: j.ip
        })
    })

    i.containers = Cosmos.prototype.dedupe.call(null, i.containers)
  })

  return { updatedServices, newServices }
}

/**
 * Persist merged config to DynamoDB.
 *
 * @param allServices Object containing updated and new services.
 * @returns {!Promise.<!Array>}
 */
Cosmos.prototype.persistAll = (allServices) => {
  const updateDeferreds = allServices.updatedServices.map(i => {
    let defer = Q.defer()
    Service.update(i, defer.makeNodeResolver())
    return defer
  })

  const createDeferred = Q.defer()
  Service.create(allServices.newServices, createDeferred.makeNodeResolver())

  return Q.all(updateDeferreds.concat(createDeferred))
}

/**
 * Generate configuration file using services data returned by persistence operation.
 *
 * @param servicesData Array containing results of saving new and updated services.
 */
Cosmos.prototype.generateConfigFile = (servicesData) => {
  const flattenedData = [].concat.apply([], servicesData)
  const services = flattenedData.map(i => i.get())

  nunjucks.configure('template', { autoescape: true })

  return nunjucks.render('haproxy.cfg.njk', { services })
}

// Used by tests.
exports.Cosmos = Cosmos

/**
 * Entry point that will be called by AWS Lambda service.
 *
 * @param event
 * @param context
 * @param callback
 */
exports.handler = (event, context, callback) => {
  console.log('Received event:', JSON.stringify(event, null, 2))

  const cosmos = new Cosmos()

  const cleanseAgainstLiveData = (storedData) => cosmos.cleanse(storedData, event)
  const mergeWithLiveData = (storedServices) => cosmos.merge(storedServices, event)
  const handlerSuccess = configFile => context.done(null, configFile)
  const handlerFailure = err => context.done(err.stack)

  Service.config({tableName: event.tableName})

  cosmos.maybeCreateTable()
    .then(cosmos.scanTable)
    .then(cleanseAgainstLiveData)
    .then(cosmos.persistCleanseOutcome)
    .then(mergeWithLiveData)
    .then(cosmos.persistAll)
    .then(cosmos.generateConfigFile)
    .then(handlerSuccess)
    .fail(handlerFailure)
}
