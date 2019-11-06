Example of serveral federated services
======================================
This example shows 2 postgraphile services federated with a appolo-server service all federated through @apollo-gateway.


Setup
-----
1) Create the databses: 
`$> createdb accountsdb`
`$> createdb productsdb`

2) run the database creation scripts - THIS WILL CREATE ROLES ON YOUR SERVER
`$> cat ./accounts/database.sql > psql -d accountsdb`
`$> cat ./products/database.sql > psql -d products`

3) Setup project (make sure you have built federation package):
`$> yarn install`
`$> yarn start`

4) Navigate to https://localhost:3001

Example Query:
```graphql
query {
  purchase(purchaseId: 2) {
    account {
      firstName,
      purchases {
        purchaseId,
				product {
          reviews {
            body
          }
        }
      }
    }
  }
}
```