#!/bin/bash

res1=$(date +%s.%N)

if [ -z $1 ]; then
	if ! command -v pkg &> /dev/null
	then
		echo "pkg could not be found. install with sudo npm install pkg -g"
	else
		echo "Building Binary Package"
		pkg --compress Brotli .
	fi
else
	case $1 in
	release )
		if [ -z $2 ]; then
			echo "No version number specified!"
		else
			echo "Building for Release v$2.."
			echo "NOTE: Building for release is meant for package maintainers only!!!"
			echo
			echo "If you simply wish to build a new binary, just execute 'build.sh' with"
			echo "no command line parameters, this will generate a new binary in bin/"
			echo
			echo "Release Checklist:" 
			echo "- test changes"
			echo "- commit changes"
			echo "- update changelog"
			echo
			echo "build.sh will update the version numbers in source and README.md to v$2!"
			echo
			read -r -p "Are you sure you want to continue? [y/N] " response
			case "$response" in
				[yY][eE][sS]|[yY])
					echo
					echo "Old src/gpumgr.js:"
					echo
					head -9 src/gpumgr.js

					sleep 1

					echo
					echo "Updating version number to v$2 in src/gpumgr.js.."
					sed -i '0,/const $version = `.*`;/{s/const $version = `.*`;/const $version = `'$2'`;/}' src/gpumgr.js
					sed -i '0,/	gpumgr v[0-9]/{s/	gpumgr v[0-9].*/	gpumgr v'$2'/}' src/gpumgr.js

					echo
					echo "New src/gpumgr.js:"
					echo
					head -9 src/gpumgr.js

					sleep 1

					echo
					echo "Old package.json:"
					echo "const fs = require('fs'); const util = require('util'); console.log(JSON.parse(fs.readFileSync('package.json','utf8')));" | node -
					echo

					sleep 1

					echo "Updating version numer to v$2 in package.json.."
					sed -i 's/\t"version": ".*/\t"version": "'$2'",/' package.json

					echo
					echo "New package.json:"
					echo "const fs = require('fs'); const util = require('util'); console.log(JSON.parse(fs.readFileSync('package.json','utf8')));" | node -
					echo

					sleep 1

					echo "Building for release v$2.."
					./build.sh

					echo
					echo "Old docs/README.md:"
					echo
					head -1 docs/README.md

					sleep 1

					echo
					echo "Updating version number in docs/README.md to v$2"
					sed -i '{s/gpumgr v[0-9].*/gpumgr v'$2'/}' docs/README.md

					echo
					echo "New docs/README.md:"
					echo
					head -1 docs/README.md

					sleep 1

					echo
					echo "Creating GitHub README.md with changes/todo appended in project root"
					#TODO: Automatically add usage to docs/README.md somehow
					cat docs/README.md > README.md
					cat docs/CHANGELOG.md >> ./README.md
					cat docs/TODO.md >> ./README.md

					echo
					echo "Generated GitHub README.md:"
					echo
					cat README.md
					
					sleep 1

					echo
					echo "Creating source release gzip in release/"
					tar -c --exclude-from=.tarignore -vzf release/gpumgr-v$2-src.tar.gz ../gpumgr/
					echo "Done!"

					echo
					echo "Creating source release bzip2 in release/"
					tar -c --exclude-from=.tarignore -vjf release/gpumgr-v$2-src.tar.bz2 ../gpumgr/
					echo "Done!"

					echo
					echo "Creating binary distribution release gzip in release/"
					tar -cvzf release/gpumgr-v$2-binary-linux.tar.gz --xform='s,bin/,,' ../gpumgr/bin/gpumgr --xform='s,docs/,,' ../gpumgr/docs/LICENSE.md ../gpumgr/README.md
					echo "Done!"

					echo
					echo "Creating binary distribution release bzip2 in release/"
					tar -cvjf release/gpumgr-v$2-binary-linux.tar.bz2 --xform='s,bin/,,' ../gpumgr/bin/gpumgr --xform='s,docs/,,' ../gpumgr/docs/LICENSE.md ../gpumgr/README.md
					echo "Done!"

					echo
					echo "Release build v$2 complete."

					echo
					res2=$(date +%s.%N)
					dt=$(echo "$res2 - $res1" | bc)
					dd=$(echo "$dt/86400" | bc)
					dt2=$(echo "$dt-86400*$dd" | bc)
					dh=$(echo "$dt2/3600" | bc)
					dt3=$(echo "$dt2-3600*$dh" | bc)
					dm=$(echo "$dt3/60" | bc)
					ds=$(echo "$dt3-60*$dm" | bc)

					LC_NUMERIC=C printf "Total buld time: %02d:%02d:%02.4f\n" $dh $dm $ds

					git status
					echo
					echo "Would you like to stage the above shown changes?"
					echo
					read -r -p "Are you sure you want to 'git add -u' to update repo? [y/N] " response
					case "$response" in
						[yY][eE][sS]|[yY])
							echo "Updating local repo!"
							git add -u
						;;
						*)
							echo "Not updating local repo!"
						;;
					esac

					git status
					echo
					echo "Would you like to commit the shown local staged changes?"
					echo
					read -r -p "Are you sure you commit changes to local repo? [y/N] " response
					case "$response" in
						[yY][eE][sS]|[yY])
							git commit
						;;
						*)
							echo "Not committing changes!"
						;;
					esac					

					git status
					echo
					echo "Would you like to push repo to GitHub? Make sure you've made all commits first!"
					echo
					read -r -p "Are you sure you want to push to GitHub.IO? [y/N] " response
					case "$response" in
						[yY][eE][sS]|[yY])
							echo "About to push to GitHub!"
							git push
						;;
						*)
							echo "Not pushing to GitHub!"
						;;
					esac					
				;;
				*)
					echo "Aborting!! Build not done."
				;;
			esac			
		fi
	;;
	esac
fi