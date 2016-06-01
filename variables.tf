variable "access_key" {
  description = "The AWS access key."
}

variable "secret_key" {
  description = "The AWS secret key."
}

variable "region" {
  description = "The AWS region to create resources in."
  default = "us-east-1"
}

variable "availability_zones" {
  description = "The availability zone."
  default = "us-east-1b"
}

variable "vpc_subnet_availability_zone" {
  description = "The VPC subnet availability zone."
  default = "us-east-1b"
}

variable "lambda_function_name" {
  description = "Name of the lambda function."
  default = "cosmos"
}

variable "s3_bucket" {
  description = "S3 bucket where the lambda function code will be stored."
  default = "flexisaf-cosmos-lambda"
}
