const test = require('blue-tape')
const Cosmos = require('./index').Cosmos

test('Dedupe works', t => {
  t.plan(1)

  const listWithDuplicates = ['does', 'the', 'the', 'stuff', 'work', 'work']
  const expected = ['does', 'the', 'stuff', 'work']

  const cosmos = new Cosmos()
  const actual = cosmos.dedupe(listWithDuplicates)

  t.deepEqual(actual, expected)
})