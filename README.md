# observabilityonaws
deployment of observability solutions on AWS


prerequesite: 
cdk -v 1.19
awscli -v 
node -v
docker -v

installation:

run commande cdk deploy --all in backend directory



Request sender :
`
cd test
node send_request.js --nb=xxx
`
xxx is the number of http call you want to send to the backend
You can confugre param.js to change company and person names.