# GeoDB network bootstrap

## TODOs

- [x] Add installation script for Fabric prerequisites: docker, docker-compose, docker images.
- [x] Enable TLS
- [ ] Implement tests
- [ ] Customize node names. Implement script for generic node deployment and network peer join.
- [ ] Implement business logic for smart contract interaction
- [ ] Implement business logic for datasets addition, purchase, etc.
- [ ] Initial certificates emission with Openssl
- [ ] Log Hub
- [ ] Enable user to select deployment on localhost or on GCP

## Dependencies

### Terraform

- **MAC OSX**:

  `brew install terraform`

- **Ubuntu**:

  `wget https://releases.hashicorp.com/terraform/0.12.6/terraform_0.12.6_linux_amd64.zip`

  `sudo unzip ./terraform_0.12.6_linux_amd64.zip -d /usr/local/bin/`

### Google Platform SDK

- **MAC OSX**:

- **Ubuntu**:

  `$ export CLOUD_SDK_REPO="cloud-sdk-$(lsb_release -c -s)"`

  `$ echo "deb http://packages.cloud.google.com/apt $CLOUD_SDK_REPO main" | sudo tee -a /etc/apt/sources.list.d/google-cloud-sdk.list`

  `$ curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo apt-key add -`

  `$ sudo apt-get update && sudo apt-get install google-cloud-sdk`

  

## Local testnet setup

1- ca-root.geodb.com should be recognized by the host as 127.0.0.1 (edit your hosts file to add this).
2- cd to /build-local-testnet and run initialize.sh. This will spawn the needed cryptomaterials.
3- Optionally, check that everything is fine running start.sh. This step can be done from the client GUI application.

From there you should be able to run the client GUI application.

## RootCA GCP testnet Setup

> Generate and store your `.json` credential from GCP. Change the directory that is set in `network/build-network-GCP/secret/secret.tfvars`. 

To setup application you must `cd ` into directory `network/build-network-GCP` and run `initialize.sh` script. 

###Previous checks

This script will check if network and / or RootCA already exists:

```bash
=========================================================
Checking if network exists
=========================================================
Network already exists. Stop the network first
```

If this message appear, it means that a network is running or problably it must clean from previous execution. Running `reset.sh` script is enough

In addition, you can see this message:

```bash
=========================================================
Checking if exists some CA active at GCP
=========================================================

A rootCA has been detected, skipping this step
```

This means a rootCA is already setup at GCP.

### Execution

To set up the rootCA an _image_ has been created at GCP. This image has every dependencies that CA needs to run properly in order to agile the setting up process.

> Make sure yo have credentials in `.json` format and change `secret.tfvars` to include your `.json` credential directory. You can download `.json` credential from GCP console: API and services >> Credentials

Process will call to `main.tf` that is a Terraform script where is included configuration to setup the GCP instance. It defines:

- Name of instance
- Network and Firewall
- Setup Script to launch root CA service

```bash
=========================================================
Starting Root CA
=========================================================


Initializing the backend...

Initializing provider plugins...

The following providers do not have any version constraints in configuration,
so the latest version was installed.

To prevent automatic upgrades to new major versions that may contain breaking
changes, it is recommended to add version = "..." constraints to the
corresponding provider blocks in configuration, with the constraint strings
suggested below.

* provider.google: version = "~> 2.13"
* provider.random: version = "~> 2.2"

Terraform has been successfully initialized!

You may now begin working with Terraform. Try running "terraform plan" to see
any changes that are required for your infrastructure. All Terraform commands
should now work.

If you ever set or change modules or backend configuration for Terraform,
rerun this command to reinitialize your working directory. If you forget, other
commands will detect it and remind you to do so if necessary.
random_id.instance_id: Creating...
random_id.instance_id: Creation complete after 0s [id=XwRdpurhEOc]
google_compute_instance.ca-root: Creating...
google_compute_instance.ca-root: Still creating... [10s elapsed]
google_compute_instance.ca-root: Creation complete after 12s [id=ca-root-5f045da6eae110e7]

Apply complete! Resources: 2 added, 0 changed, 0 destroyed.

=========================================================
Waiting for FabricCA server. Please Wait
=========================================================
```

To ensure that all services are operational, a waiting time of 2 minutes has been established. After this idle time, the public certificate from rootCA:

```bash
=========================================================
Downloading cert, please insert passphrase.
=========================================================

Warning: Permanently added 'compute.2669558137883452705' (ECDSA) to the list of known hosts.
Enter passphrase for key '/home/javier/.ssh/google_compute_engine': 
tls-cert.pem                                                                                                                                                                             100%  916     5.9KB/s   00:00    
INFO:.... Proccess Succeed

=========================================================
Download complete
=========================================================
```

This certificate will be useful to set up an *Intermediate CA server* and enroll it to *rootCA*. But, before building certificates FabricCA should be recognized by the host, so `/etc/hosts` must be edited. Next alert informs about that:

```bash
=========================================================
FabricCA should be recognized by the host. Edit your hosts file to add this.
IP address --> [u'35.225.24.187']
Host Name --> ca-root.geodb.com
=========================================================

Have you edit your host file (y/n)?
```

You have to include:

```
<IP_address>		ca-root.geodb.com 	#This is root CA that is deployed on GCP instance
127.0.0.1       ca-root.geodbInt1.com 	#This is the new CA Intermediate that will be deployed locally
```

After that, the script will build certificates and setup the federation Network automatically.

## Important note

Do not publish secret enrollment password contained in /CA/ca-bootstrap-command.yaml. Change the secret for live environments
