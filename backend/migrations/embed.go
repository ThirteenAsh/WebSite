// Package migrations embeds the SQL files used to initialize the database.
package migrations

import _ "embed"

//go:embed 001_init.sql
var InitialSchema string
