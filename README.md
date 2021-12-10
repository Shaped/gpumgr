gpumgr is the spiritual successor to amdpwrman

Re-written in JS (NodeJS) to make things easier to code and maintain, especially around adding other GPU vendors. Also allows us to have a better daemon solution (than a shell script) and a web interface.

Since it's no longer just a shell script, obviously there are more dependencies: currently, just a recent version of NodeJS.

There's also a binary compiled verison for Linux in /bin/, this has been compiled with pkg and is simply there so you have a quick option to get up and running.

Don't trust the binary? Build it yourself; run build.sh with pkg installed and your binary will pop out in ../bin/

Usage is quite similar to that of amdpwrman.

Usage:

```
gpumgr 0.03a    (C) 2022 Jai B. (Shaped Technologies)           GPLv3 License

gpumgr shows statistics and manipulates power limit settings for GPUs on Linux
through various interfaces provided by manufacturer's drivers, for example,
using the sysfs interface to interact with the amdgpu driver.

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

  gpumgr help | --help | -h             Display this help message.
  gpumgr list <gpu>                     List available GPUs and their GPU#
  gpumgr show <gpu>                     Show detailed statistics for <gpu>
  gpumgr status <gpu>                   Same as above
  gpumgr power <percent> <gpu>          Set <gpu>'s power target to <percent>
  gpumgr power reset <gpu>              Reset default power limit for <gpu>
  gpumgr recover <gpu>                  Attempt driver recovery mechanism for <gpu>
  gpumgr fan enable <gpu>               Enable manual fan control for <gpu>
  gpumgr fan disable <gpu>              Disable manual fan control for <gpu>
  gpumgr fan [percent] <gpu>            Set <gpu>'s fan speed to <percent>
  gpumgr start <options>                Starts the gpumgr background service
  gpumgr stop                           Stops the gpumgr background service

Options for Commands with Options:

  gpumgr start                          Starts the gpumgr background service

  Options for 'start':
    --port <number>                     Set which ipv4 port to listen on (eg. 1969)
    --host <ip>                         Set which ipv4 host to listen on (eg. 0.0.0.0
                                        or 127.0.0.1)

Examples:

  gpumgr show nvidia                    Show status of all Nvidia GPUs
  gpumgr list intel                     List all Intel GPU#s
  gpumgr fan enable 0                   Enable manual fan control for GPU0
  gpumgr fan disable all                Enable auto fan control for all GPUs
  gpumgr fan 100% 0                     Set GPU0 fan speed to 100%
  gpumgr start --port 4200              Start the background service on port 4200

```
