## gpumgr v0.0.6-alpha

gpumgr is the spiritual successor to amdpwrman

Re-written in JS (NodeJS) to make things easier to code and maintain, especially around adding other GPU vendors. Also allows us to have a better daemon solution (than a shell script) and a web interface.

Since it's no longer just a shell script, obviously there are more dependencies: currently, just a recent-ish version of NodeJS (\~10.20+).

### Building & Binary

There's also a binary compiled/packaged verison for Linux in *bin/*, this has been compiled/"packaged" with *[pkg](https://github.com/vercel/pkg)* and is simply there so you have a quick option to get up and running without having to install NodeJS or any dependencies.

Don't trust the binary? No problem! You can easily just run the script directly or build it yourself; run build.sh with *[pkg](https://github.com/vercel/pkg)* installed and your binary will pop out in *bin/* - technically, you don't need NodeJS installed to do the build even as *[pkg](https://github.com/vercel/pkg)* will download the appropriate binaries; however, installing *[pkg](https://github.com/vercel/pkg)* requires npm which requires NodeJS..? You can easily build for other versions of NodeJS than what you have installed though.

### Usage:

Usage is quite similar to that of amdpwrman - almost identical from the command line.

You can call the script directly and the shebang will call NodeJS.

If you don't have NodeJS, you can download the binary version which is simply this script pre-packed with *[pkg](https://github.com/vercel/pkg)* with the required NodeJS and dependencies to run.

```
gpumgr v0.0.6-alpha

gpumgr shows statistics and manipulates power limit settings for GPUs on
Linux through various interfaces provided by manufacturer's drivers, for
example, using the sysfs interface to interact with the amdgpu driver.

The original script (amdpwrman) was designed to be simple, easy to use and have
no dependencies, however, BASH scripting is kind of a pain so I decided to
rewrite this as a NodeJS app with an included (optional to use) web interface.

There will be an easy to use binary distribution of this, or you can just clone
the repo and run or build the script yourself.

Most commands will execute the command and exit. For example, using
'./gpumgr fan 50% 0' to set fan speed to 50% for GPU 0, gpumgr will simply set
it once and exit.

If you want fan speed monitoring or curve control or to use the web interface,
you must start the daemon. Once the daemon is running, you can manage settings
for your GPUs at http://127.0.0.1:1969 - or on whatever port you specified.

Usage:

  gpumgr [command] <gpu> <options>

  If <gpu> is omitted from any command, GPU0 is assumed.

  <gpu> can be a comma separated list of GPU numbers.
  <gpu> can be set to 'all' to affect ALL GPUs
  <gpu> can be set to 'amd' to affect all AMD GPUs
  <gpu> can be set to 'nvidia' to affect all Nvidia GPUs
  <gpu> can be set to 'intel' to affect all Intel GPUs

  Commands with no options or only GPU specified:

        help | --help | -h              Display this help message.
        list <gpu>                      List available GPUs and their GPU#.
        show <gpu>                      Show detailed statistics for <gpu>.
        status <gpu>                    Same as above.
        power <percent> <gpu>           Set <gpu>'s power target to <percent>.
        power reset <gpu>               Reset default power limit for <gpu>.
        recover <gpu>                   Attempt driver recovery mechanism for <gpu>.
        fan enable <gpu>                Enable manual fan control for <gpu>.
        fan disable <gpu>               Disable manual fan control for <gpu>.
        fan [percent] <gpu>             Set <gpu>'s fan speed to <percent>.
        start <options>                 Starts the gpumgr service.
        restart                         Soft Restarts the gpumgr service.
        stop                            Stops the gpumgr service.
        force restart                   Fully Restarts the gpumgr service.
        force stop                      Kills the gpumgr service.

Options for Commands with Options:

        start                           Starts the gpumgr background service.

  Options for 'start':
    --port <number>                     Set which ipv4 port to listen on.
                                        (eg. 1969, default is 4242)
    --host <ip>                         Set which ipv4 host to listen on.
                                        (eg. 0.0.0.0 or 127.0.0.1)

Examples:

  gpumgr show nvidia                    Show status of all Nvidia GPUs
  gpumgr list Intel                     List all Intel GPU#s
  sudo gpumgr fan enable 0              Enable manual fan control for GPU0
  sudo gpumgr fan disable all           Enable auto fan control for all GPUs
  sudo gpumgr fan 100% 0                Set GPU0 fan speed to 100%
  sudo gpumgr start --port 4200         Start the background service on port 4200
```
### CHANGELOG.md

```
0.01a - 12/7/21 - the beginning, able to show stats for AMD GPUs
0.02a - 12/8/21 - able to show some stats for nvidia GPUs as well
0.03a - 12/8/21 - service structure started
0.04a - 12/9/21 - fan control for amdgpu enabled
0.05a - 12/9/21 - some tidying up, build.sh updated for making release easier for me
0.0.6-alpha - 12/9/21 - more tidying up for build stuff, version numbering now npm friendly
```
### TODO.md

- finish implementing all amdgpu features from amdpwrman
- implement as much original^ functionality as possible for nvidia
- ^ same for intel
- start on web interface stuff
- add ability to change clocks and other features
- is there *any* way to change NVIDIA clocks without X?
  - I haven't seen anything really, although the amdpwrman reddit thread had some links to other programs doing good things
- can we set custom amd clock easily, rather than selecting profiles?
  - should we have any amdgpu flashing features? (low priority)
  - could potentially make custom BIOS on the fly? (low priority)
