targetScope = 'subscription'

@description('Deployment environment name, e.g. dev, stg, prod')
param environmentName string

@description('Azure region')
param location string = 'japaneast'

@description('Optional common tags')
param tags object = {}

var resourceGroupName = 'rg-oip-${environmentName}'
var commonTags = union(tags, {
  system: 'organizational-intelligence-platform'
  environment: environmentName
  managedBy: 'bicep'
  costCenter: 'oip'
})

resource resourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: commonTags
}

module functions 'modules/functions.bicep' = {
  name: 'functions'
  scope: resourceGroup
  params: {
    environmentName: environmentName
    location: location
    tags: commonTags
  }
}

output resourceGroupName string = resourceGroup.name
output location string = resourceGroup.location
output functionAppName string = functions.outputs.functionAppName
