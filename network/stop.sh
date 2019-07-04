# !/bin/bash

export COMPOSE_PROJECT_NAME=geodb

DOCKER_FILE=$1

if [ -z "$DOCKER_FILE" ]; then
  DOCKER_FILE=./build-local-testnet/docker-compose.yaml
fi

# Bring down the network
docker-compose -f $DOCKER_FILE kill && docker-compose -f $DOCKER_FILE down
sleep 1s
# Delete EVERYTHING related to chaincode in docker
docker rmi --force $(docker images -q dev-peer*)
docker rm -f $(docker ps -aq)

if [ $(docker images dev-* -q) ]; then
  echo "Chaincode exists"
else
  echo "No chaincode exists"
fi
