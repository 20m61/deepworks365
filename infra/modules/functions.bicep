@description('環境名 (dev/stg/prod)')
param environmentName string
@description('リージョン')
param location string
@description('共通タグ')
param tags object = {}

var suffix = uniqueString(resourceGroup().id)
var storageName = toLower('stoip${environmentName}${suffix}')
var planName = 'plan-oip-${environmentName}'
var appName = 'func-oip-${environmentName}-${suffix}'
var sbName = 'sb-oip-${environmentName}-${suffix}'
var queueName = 'events'

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  tags: tags
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: { minimumTlsVersion: 'TLS1_2', allowBlobPublicAccess: false }
}

resource deployContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: '${storage.name}/default/deploymentpackage'
}

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-oip-${environmentName}'
  location: location
  tags: tags
  properties: { sku: { name: 'PerGB2018' }, retentionInDays: 30 }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-oip-${environmentName}'
  location: location
  tags: tags
  kind: 'web'
  properties: { Application_Type: 'web', WorkspaceResourceId: logs.id }
}

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: planName
  location: location
  tags: tags
  sku: { name: 'FC1', tier: 'FlexConsumption' }
  kind: 'functionapp'
  properties: { reserved: true }
}

resource sb 'Microsoft.ServiceBus/namespaces@2022-10-01-preview' = {
  name: sbName
  location: location
  tags: tags
  sku: { name: 'Standard', tier: 'Standard' }
}

resource sbQueue 'Microsoft.ServiceBus/namespaces/queues@2022-10-01-preview' = {
  parent: sb
  name: queueName
}

resource site 'Microsoft.Web/sites@2024-04-01' = {
  name: appName
  location: location
  tags: union(tags, { 'azd-service-name': 'ingest-func' })
  kind: 'functionapp,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.properties.primaryEndpoints.blob}deploymentpackage'
          authentication: { type: 'SystemAssignedIdentity' }
        }
      }
      scaleAndConcurrency: { maximumInstanceCount: 40, instanceMemoryMB: 2048 }
      runtime: { name: 'node', version: '20' }
    }
    siteConfig: {
      appSettings: [
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
        { name: 'SERVICE_BUS_NAMESPACE', value: '${sb.name}.servicebus.windows.net' }
        { name: 'SERVICE_BUS_QUEUE', value: queueName }
        { name: 'ServiceBusConnection__fullyQualifiedNamespace', value: '${sb.name}.servicebus.windows.net' }
      ]
    }
  }
}

// RBAC: Function の Managed Identity にデプロイ storage と Service Bus 受信権限。
var blobOwnerRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b')
var sbReceiverRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4f6d3b9b-027b-4f4c-9142-0e5a2a2247e0')

resource storageRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, site.id, blobOwnerRole)
  scope: storage
  properties: { principalId: site.identity.principalId, roleDefinitionId: blobOwnerRole, principalType: 'ServicePrincipal' }
}

resource sbRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(sb.id, site.id, sbReceiverRole)
  scope: sb
  properties: { principalId: site.identity.principalId, roleDefinitionId: sbReceiverRole, principalType: 'ServicePrincipal' }
}

output functionAppName string = site.name
output serviceBusNamespace string = sb.name
