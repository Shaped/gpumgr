/*
    FreeForm ANSI class (C) 2022 Jai B
    Because, y'know, we need whole npm libraries for this apparently ...no
*/ 

class ansi {
    constructor(_parent) {
        this.Reset = "\x1b[0m";
        this.Bright = "\x1b[1m";
        this.Dim = "\x1b[2m";
        this.Underscore = "\x1b[4m";
        this.Blink = "\x1b[5m";
        this.Reverse = "\x1b[7m";
        this.Hidden = "\x1b[8m";

        this.FgBlack = "\x1b[30m";
        this.FgRed = "\x1b[31m";
        this.FgGreen = "\x1b[32m";
        this.FgYellow = "\x1b[33m";
        this.FgBlue = "\x1b[34m";
        this.FgMagenta = "\x1b[35m";
        this.FgCyan = "\x1b[36m";
        this.FgWhite = "\x1b[37m";

        this.FgGrey = "\x1b[90m";
        this.FgBrRed = "\x1b[91m";
        this.FgBrGreen = "\x1b[92m";
        this.FgBrYellow = "\x1b[93m";
        this.FgBrBlue = "\x1b[94m";
        this.FgBrMagenta = "\x1b[95m";
        this.FgBrCyan = "\x1b[96m";
        this.FgBrWhite = "\x1b[97m";

        this.BgBlack = "\x1b[40m";
        this.BgRed = "\x1b[41m";
        this.BgGreen = "\x1b[42m";
        this.BgYellow = "\x1b[43m";
        this.BgBlue = "\x1b[44m";
        this.BgMagenta = "\x1b[45m";
        this.BgCyan = "\x1b[46m";
        this.BgWhite = "\x1b[47m";
    }
    disableColor() {
        let keys = Object.keys(this);
        for (let color of keys) this[color] = ``;
        this.Reset = "\x1b[0m";
    }
};

module.exports = (p) => { return new ansi(p); }