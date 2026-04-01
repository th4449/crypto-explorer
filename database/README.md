# Database Setup

This directory contains the database initialization script and migration files for the crypto-explorer platform.

## Starting the Database

From the project root, run

```
docker-compose up -d
```

This starts a PostgreSQL 16 instance with the Apache AGE extension pre-installed.

## Initialization

The init.sql script runs automatically on first start. It enables the AGE extension, creates the crypto_graph, and sets up the relational tables for users, API keys, and audit logging.

## Migrations

Migration files in the migrations/ directory are numbered sequentially (001_, 002_, etc.) and should be run in order against the database when deploying updates.

## Connection

Default local connection string

```
postgresql://app_user:your_password@localhost:5432/crypto_explorer
```
