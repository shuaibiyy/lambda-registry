const test = require('blue-tape')
const Cosmos = require('./index').Cosmos
const testData = require('./sample-data/data')

test('Dedupe works', t => {
  t.plan(1)

  const listWithDuplicates = ['does', 'the', 'the', 'stuff', 'work', 'work']
  const expected = ['does', 'the', 'stuff', 'work']

  const cosmos = new Cosmos()
  const actual = cosmos.dedupe(listWithDuplicates)

  t.deepEqual(actual, expected)
})

test('Cleansed stored data should not contain services and containers that no longer exist', t => {
  t.plan(1)

  const storedServices = [{
    "serviceName": "app1",
    "configMode": "host",
    "predicate": "first.example.com",
    "cookie": "JSESSIONID",
    "containers": [
      {
        "id": "jk3243j54jl",
        "ip": "192.168.1.8:80"
      }
    ]
  },
  {
    "serviceName": "app2",
    "configMode": "host",
    "predicate": "second.example.com",
    "cookie": "JSESSIONID",
    "containers": [
      {
        "id": "czh32m2ob43",
        "ip": "192.168.1.10:80"
      }
    ]
  }]

  const storedData = {Items: [{attrs: storedServices}]}
  const liveData = testData

  const expectedUnavailableSrvcs = storedServices.filter(i => i['serviceName'] === 'app2')
  const expectedAvailableSrvcs =
    [{
      configMode: 'host',
      predicate: 'first.example.com',
      containers: [{
        "id": "jk3243j54jl",
        "ip": "192.168.1.8:80"
      }],
      serviceName: 'app1',
      cookie: 'JSESSIONID'
    }]

  const cosmos = new Cosmos()
  const srvcs = cosmos.cleanse(storedData, liveData)
  const expectedSrvcs = {
    unavailableSrvcs: expectedUnavailableSrvcs,
    availableSrvcs: expectedAvailableSrvcs
  }

  t.deepEqual(srvcs, expectedSrvcs)
})

test('Merging stored and live services should result in services with containers from both', t => {
  t.plan(1)

  const storedServices = [{
    "serviceName": "app1",
    "configMode": "host",
    "predicate": "first.example.com",
    "cookie": "JSESSIONID",
    "containers": [
      {
        "id": "jk3243j54jl",
        "ip": "192.168.1.8:80"
      }
    ]
  }]

  const candidateService = {
    "serviceName": "app2",
    "configMode": "host",
    "predicate": "second.example.com",
    "cookie": "JSESSIONID",
    "containers": [
      {
        "id": "das843j3h3k",
        "ip": "192.168.1.10:80"
      },
      {
        "id": "fds32k4354f",
        "ip": "192.168.1.11:80"
      }
    ]
  }

  testData.candidates.push(candidateService)

  const liveData = testData

  const updatedSrvcs = [{
    serviceName: 'app1',
    configMode: 'host',
    predicate: 'first.example.com',
    cookie: 'JSESSIONID',
    containers: [{
      "id": "jk3243j54jl",
      "ip": "192.168.1.8:80"
    },
    {
      "id": "a23nj53h3j4",
      "ip": "192.168.1.9:80"
    }]
  }]

  const newSrvcs = [{
    "serviceName": "app2",
    "configMode": "host",
    "predicate": "second.example.com",
    "cookie": "JSESSIONID",
    "containers": [{
      "id": "das843j3h3k",
      "ip": "192.168.1.10:80"
    },
    {
      "id": "fds32k4354f",
      "ip": "192.168.1.11:80"
    }]
  }]

  const expectedServices = { updatedSrvcs, newSrvcs }

  const cosmos = new Cosmos()
  const services = cosmos.merge(storedServices, liveData)

  t.deepEqual(services, expectedServices)
})
