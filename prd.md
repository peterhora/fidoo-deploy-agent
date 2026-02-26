#Problem definition

Users a vibe coding business application, static html, javascript business logic running in browser, no backend, no database, just file storage.

We are looking for a way how to deploy the apps to Azure. It should be as easy as possible for end users. They are using claude code and claude cowork so ideal solution for them would be a plugin with a deployment agent.

The company uses Azure so all Azure services are available for the deployment solution. The current candidate is Azure Static Web Apps.

All repos are in Bitbucket. However, the business users don't know how to use git so if it should be a part of the solution it needs to be hiden from them.

Access to apps needs to be projected by authorisation using Entra ID with an employee account. 

The distribution of plugin needs to be centralized. Dependencies on 3rd party software might be a security issue. Keep the techstack minimal, might use MCPs which would be bundled into the plugin