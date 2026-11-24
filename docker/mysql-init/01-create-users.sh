#!/bin/bash
set -e

escape_sql_value() {
  printf '%s' "$1" | sed "s/'/''/g"
}

escape_sql_identifier() {
  printf '%s' "$1" | sed 's/`/``/g'
}

app_user=$(escape_sql_value "$APP_DB_USER")
app_password=$(escape_sql_value "$APP_DB_PASSWORD")
migration_user=$(escape_sql_value "$MIGRATION_DB_USER")
migration_password=$(escape_sql_value "$MIGRATION_DB_PASSWORD")
database_name=$(escape_sql_identifier "$MYSQL_DATABASE")

mysql --protocol=socket -uroot -p"$MYSQL_ROOT_PASSWORD" <<SQL
CREATE USER IF NOT EXISTS '$app_user'@'%' IDENTIFIED BY '$app_password';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`$database_name\`.* TO '$app_user'@'%';
CREATE USER IF NOT EXISTS '$migration_user'@'%' IDENTIFIED BY '$migration_password';
GRANT SELECT, INSERT, CREATE, ALTER, INDEX ON \`$database_name\`.* TO '$migration_user'@'%';
SQL
