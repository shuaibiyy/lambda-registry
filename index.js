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

/**
 * Create table if it does not exist already.
 * @returns {*}
 */
function maybeCreateTable () {
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
function scanTable () {
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
function dedupe (arr) {
  let tmpMap = {}
  arr.forEach(function (val) {
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
 * @param storedConfig
 * @param liveConfig
 */
function cleanse (storedConfig, liveConfig) {
  const getLiveAttributeSet = (attr) => new Set(liveConfig.services.map(i => i[attr]))
  const isServiceAvailable = i => getLiveAttributeSet('serviceName').has(i.serviceName)
  const isContainerAvailable = i => getLiveAttributeSet('id').has(i.id)

  const availableServices = storedConfig.filter(isServiceAvailable)
  availableServices.forEach(i => i.containers = i.containers.filter(isContainerAvailable))

  const unavailableServices = storedConfig.filter(i => !isServiceAvailable(i))

  const deferreds = unavailableServices.map(i => {
    let defer = Q.defer()
    Service.destroy(i, defer.makeNodeResolver())
    return defer
  })

  return Q.all(deferreds)
    .then((content) => availableServices)
}


/**
 * Merge both data structures so that the one returned contains a set of containers from both.
 *
 * @param updatedConfig
 * @param liveConfig
 * @returns {*}
 */
function merge (updatedConfig, liveConfig) {
  const storedServices = new Set(updatedConfig.map(i => i.serviceName))

  const doesStoredServicesContainService = i => storedServices.has(i.serviceName)
  const filterCandidateServices = fn => liveConfig.candidateServices.filter(fn)

  const existingServices = filterCandidateServices(doesStoredServicesContainService)
  const newServices = filterCandidateServices(i => !doesStoredServicesContainService(i))
  const containersTiedToExistingServices = liveConfig.services.filter(doesStoredServicesContainService)

  updatedConfig.forEach(i => {

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

    i.containers = dedupe(i.containers)
  })

  return {
    updatedConfig: updatedConfig,
    newConfig: newServices
  }
}

/**
 * Persist merged config to DynamoDB.
 *
 * @param mergedConfig
 * @returns {!Promise.<!Array>}
 */
function persist (mergedConfig) {
  const updateDeferreds = mergedConfig.updatedConfig.map(i => {
    let defer = Q.defer()
    Service.update(i, defer.makeNodeResolver())
    return defer
  })

  const createDeferred = Q.defer()
  Service.create(mergedConfig.newConfig, createDeferred.makeNodeResolver())

  return Q.all(updateDeferreds.concat(createDeferred))
}

/**
 * Generate configuration file from data received from DynamoDB.
 *
 * @param configData
 */
function generateConfigFile (configData) {
  const flattenedConfigData = [].concat.apply([], configData)
  const config = flattenedConfigData.map(i => i.get())

  nunjucks.configure('template', { autoescape: true })

  return nunjucks.render('haproxy.cfg.njk', {services: config})
}

/**
 * Entry point that will be called by AWS Lambda service.
 *
 * @param event
 * @param context
 * @param callback
 */
exports.handler = (event, context, callback) => {
  console.log('Received event:', JSON.stringify(event, null, 2))

  const extractAttrs = data => data.Items.map(item => item.attrs)

  Service.config({tableName: event.tableName})

  maybeCreateTable()
    .then(scanTable)
    .then(data => cleanse(extractAttrs(data), event))
    .then(updatedConfig => merge(updatedConfig, event))
    .then(persist)
    .then(generateConfigFile)
    .then(configFile => context.done(null, configFile))
    .fail(err => context.done(err))
}
