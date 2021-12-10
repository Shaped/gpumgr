#!/bin/bash

if ! command -v pkg &> /dev/null
then
	echo "pkg could not be found. install with sudo npm install pkg -g"
else
	pkg --compress Brotli .
fi
