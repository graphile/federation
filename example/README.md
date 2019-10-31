Example of serveral federated services
======================================
This example shows 2 postgraphile services federated with a appolo-server service all federated through @apollo-gateway.


Setup
-----
1) Create the databses: 
$> createdb accountsdb
$> createdb productsdb

2) run the database creation scripts - THIS WILL CREATE ROLES ON YOUR SERVER
$> cat ./accounts/database.sql > psql -d accountsdb
$> cat ./products/database.sql > psql -d products

3) install dependencies and run the example:

$> yarn install
$> yarn run