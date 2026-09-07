SWISS AIRLINES — Website v5 (BULLETPROOF)

Photos are embedded directly inside index.html as base64 data. The site does NOT depend on assets/photos.
This fixes Render deployments where the assets directory is missing.

Deploy the whole project from the ZIP/repository.
1. npm install
2. npm start

IMPORTANT: If Render still prints "assets/photos/ directory NOT FOUND", it is running an OLD server.js. Replace the deployed server.js with this version and redeploy.
