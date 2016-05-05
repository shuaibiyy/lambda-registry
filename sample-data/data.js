module.exports = {
  "tableName": "astro",
  "runningServices": [
    {
      "serviceName": "app1",
      "id": "a23nj53h3j4",
      "ip": "192.168.1.9:80"
    },
    {
      "serviceName": "app1",
      "id": "jk3243j54jl",
      "ip": "192.168.1.8:80"
    }
  ],
  "candidateServices": [
    {
      "serviceName": "app1",
      "configMode": "host",
      "predicate": "first.example.com",
      "cookie": "JSESSIONID",
      "containers": [
        {
          "id": "a23nj53h3j4",
          "ip": "192.168.1.9:80"
        }
      ]
    }
  ]
}
