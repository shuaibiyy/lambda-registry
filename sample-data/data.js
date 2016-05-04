module.exports = {
  "tableName": "astro",
  "runningServices": [
    {
      "serviceName": "app1",
      "id": "gsda7843hj2b",
      "ip": "192.168.1.14:80"
    },
    {
      "serviceName": "app1",
      "id": "opw23mf43kl",
      "ip": "192.168.1.4:80"
    },
    {
      "serviceName": "app2",
      "id": "nva732b43ni",
      "ip": "192.168.1.5:80"
    },
    {
      "serviceName": "app2",
      "id": "czh32m2ob43",
      "ip": "192.168.1.7:80"
    },
    {
      "serviceName": "app3",
      "id": "gsda7843hjfd",
      "ip": "192.168.1.18:80"
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
          "id": "jk3243j54jl",
          "ip": "192.168.1.8:80"
        },
        {
          "id": "a23nj53h3j4",
          "ip": "192.168.1.9:80"
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
          "id": "das843j3h3k",
          "ip": "192.168.1.10:80"
        },
        {
          "id": "fds32k4354f",
          "ip": "192.168.1.11:80"
        }
      ]
    },
    {
      "configMode": "path",
      "serviceName": "multiservice",
      "predicate": "service",
      "containers": [
        {
          "id": "service1",
          "ip": "10.0.0.5:80"
        },
        {
          "id": "service2",
          "ip": "10.0.0.6:80"
        }
      ]
    }
  ]
}
