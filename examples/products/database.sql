CREATE TABLE product (
    product_id SERIAL PRIMARY KEY,
    product_name VARCHAR NOT NULL,
    price VARCHAR NOT NULL
);

CREATE TABLE purchase (
    purchase_id SERIAL PRIMARY KEY,
    product_id INT REFERENCES product(product_id),
    account_id INT NOT NULL,
    date_purchased TIMESTAMP NOT NULL
);

COMMENT ON COLUMN purchase.account_id IS E'@name account\n@federated Account(accountId)';

INSERT INTO product (product_name, price) VALUES
('Book 1', '2.99'),
('Book 2', '3.99'),
('Book 3', '7.99'),
('Book 4', '12.49'),
('Toy Car 1', '2.49'),
('Toy Car 2', '2.79');

INSERT INTO purchase (product_id, account_id, date_purchased) VALUES 
(2, 1, '2019-10-01 09:45:00'),
(2, 2, '2019-10-01 12:22:00'),
(3, 2, '2019-10-02 11:48:00'),
(3, 3, '2019-10-02 20:39:00'),
(3, 5, '2019-10-02 22:12:00'),
(4, 2, '2019-10-04 12:34:00'),
(4, 3, '2019-10-04 14:25:00'),
(5, 3, '2019-10-04 21:42:00'),
(5, 3, '2019-10-09 07:25:00'),
(5, 4, '2019-10-09 09:11:00'),
(5, 5, '2019-10-09 11:26:00'),
(6, 3, '2019-10-09 14:53:00');

CREATE ROLE productsuser WITH LOGIN ENCRYPTED PASSWORD 'jw8s0F4';
GRANT ALL ON ALL TABLES IN SCHEMA public TO productsuser;
