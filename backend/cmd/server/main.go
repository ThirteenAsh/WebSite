package main

import (
	"log"
	"os"

	"thirteenash/internal/app"
)

func main() {
	if err := app.Run(os.Args[1:]); err != nil {
		log.Fatal(err)
	}
}
