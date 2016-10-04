# Lambda-Registry

Lambda-Registry is a service registry for HAProxy-backed services. It runs on [AWS Lambda](https://aws.amazon.com/lambda/) and leverages [API Gateway](https://aws.amazon.com/api-gateway/) and [DynamoDB](https://aws.amazon.com/dynamodb/) to provide an API endpoint that generates `haproxy.cfg` files based on request payloads.

Lambda-Registry generates HAProxy configurations for hosts running services in containers behind a HAProxy. Lambda-Registry receives a payload describing the state of services and returns a HAProxy config that matches that state. It also stores information about past services, so their configurations persist across future HAProxy configs as long as they have running instances, i.e. containers. See [test.js](https://github.com/shuaibiyy/lambda-registry/blob/master/test.js) for examples of how services are described.

One major pain point of using Lambda and API Gateway is the difficulty of setting things up. This project uses Terraform to ease that difficulty.

## Requirements

* A machine with [Terraform](https://www.terraform.io/) installed.
* A functioning [AWS](https://aws.amazon.com/) account with access to these AWS services:
  * AWS Lambda
  * API Gateway
  * DynamoDB
  * S3
* An S3 bucket where the AWS lambda artifact will be stored.

## Request Payload

Format of a request payload to lambda-registry:

    {
      "table": "<dynamodb_table_name>",
      "running": [{
        "serviceName": "<service_name>",
        "id": "<container_id>",
        "ip": "<container_ip_address>"
      }],
      "candidates": [{
        "serviceName": "<service_name>",
        "port": <port_number>,
        "configMode": "[ host | path]",
        "predicate": "<e.g. domain_name>",
        "cookie": "<cookie_id>",
        "containers": [{
          "id": "<container_id>",
          "ip": "<container_ip_address>"
        }]
      }]
    }
Sample payloads can be found in the sample-data directory.

### Descriptions of Parameters

- table: name of DynamoDB table where configurations will be stored.
- running: instances of services running within the weave network.
- candidates: instances that are new to the weave network and do not yet exist in the HAProxy config.
- configMode: type of routing. It can be either `path` or `host`.
           In `path` mode, the URL path is used to determine which backend to forward the request to.
           In `host` mode, the HTTP host header is used to determine which backend to forward the request to.
           Defaults to `host` mode.
- serviceName: name of service the containers belong to.
- port: port number where service can be found.
- predicate: value used along with mode to determine which service a request will be forwarded to.
                `path` mode example: `acl <cluster> url_beg /<predicate>`.
                `host` mode example: `acl <cluster> hdr(host) -i <predicate>`.
- cookie: name of cookie to be used for sticky sessions. If not defined, sticky sessions will not be configured.
- containers: key-value pairs of container ids and their corresponding IP addresses.

## Deployment

Follow these steps to deploy:

1. Clone this project and `cd` into it.
2. Install npm modules: `npm install --production`
3. Compress the project: `zip -r lambda-registry.zip .`.
4. Deploy the project by simply invoking `terraform apply`. You'll be asked for your AWS credentials. If you don't want to be prompted, you can add your credentials to the `variables.tf` file or run the setup using:
```bash
$ terraform apply -var 'aws_access_key={your_aws_access_key}' \
   -var 'aws_secret_key={your_aws_secret_key}'
```

To tear down:
```bash
$ terraform destroy
```

You can find the Invoke URL for lambda-registry endpoint via the API Gateway service's console. The steps look like: `Amazon API Gateway | APIs > lambda-registry > Stages > api`.

## Usage

Lambda-Registry was written to fulfil the deployment architecture described here: [HAProxy Configuration Management with Lambda-Registry and Cosmonaut](https://shuaib.me/haproxy-config-mgmt-lambda-registry-cosmonaut/).


Lambda-Registry can be used standalone or in conjunction with [Cosmonaut](https://github.com/shuaibiyy/cosmonaut). Cosmonaut is a process that can listen to events from a docker daemon, retrieve a HAProxy configuration from lambda-registry based on the services running on its host, and use the config to reload its host's HAProxy container.

If you're using lambda-registry standalone, you can generate a config file by running these commands:
```bash
$ curl -o /tmp/haproxycfg -H "Content-Type: application/json" --data @sample-data/data.json <invoke_url>/generate
$ echo "$(</tmp/haproxycfg)" > haproxy.cfg
```

### Running Locally

You can run Lambda functions locally using [Lambda-local](https://github.com/ashiina/lambda-local) with a command like:
```bash
$ lambda-local -l index.js -h handler -e sample-data/data.js
```

### Running Tests

```
$ npm test
```

## Notes

There is a [known issue](https://forums.aws.amazon.com/message.jspa?messageID=678324) whereby a newly deployed API Gateway would fail to call a Lambda function throwing an error similar to this one:
```bash
Execution failed due to configuration error: Invalid permissions on Lambda function
Method completed with status: 500
```
Or:
```bash
{
  "message": "Internal server error"
}
```
The solution for this is straightforward and demonstrated in [this youtube video](https://www.youtube.com/watch?v=H4LM_jw5zzs).
