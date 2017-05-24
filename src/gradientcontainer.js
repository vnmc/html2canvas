var Color = require('./color');

function GradientContainer(imageData) {
    this.src = imageData.value;
    this.colorStops = [];
    this.type = null;
    this.promise = Promise.resolve(true);
}

GradientContainer.prototype.parseColorStops = function(args) {
    this.colorStops = args.map(function(colorStop) {
        var colorStopMatch = colorStop.match(GradientContainer.REGEXP_COLORSTOP);
        if (!colorStopMatch) {
            return {
                color: "transparent",
                stop: null
            };
        }

        var value = +colorStopMatch[2];
        var unit = value === 0 ? "%" : colorStopMatch[3]; // treat "0" as "0%"
        var isTransparent = colorStopMatch[1] === "transparent";

        return {
            color: isTransparent ? colorStopMatch[1] : new Color(colorStopMatch[1]),
            // TODO: support absolute stop positions (e.g., compute gradient line length & convert px to ratio)
            stop: unit === "%" ? value / 100 : null
        };
    });

    // fix transparent stops based on neighboring colors for smooth and correct gradients
    // https://github.com/niklasvh/html2canvas/pull/777/
    for (var i = 0; i < this.colorStops.length; ++i) {
        var colorStop = this.colorStops[i];
 
        if (colorStop.color === "transparent") {
            var previousColor = null;
            var nextColor = null;
            var targetColor = null;
 
            if (i > 0) {
                previousColor = this.colorStops[i - 1].color;
            } 
            if (i + 1 < this.colorStops.length) {
                nextColor = this.colorStops[i + 1].color;
            } 
            if (previousColor) {
                // If we have a color before the transparency, that should the
                // color of this transparency as well
                targetColor = previousColor;
            } else {
                // Otherwise, the color following the transparency is our target color
                targetColor = nextColor;
            }
 
            // Copy target color setting alpha to 0
            colorStop.color = new Color([targetColor.r, targetColor.g, targetColor.b, 0]);
 
            // If this transparency is between 2 non-"transparent" colors then add a
            // new color stop at the same position but with the color of the following
            // color for a clean gradient
            if (previousColor && nextColor && nextColor !== "transparent") {
                var newColorStop = {
                    color: new Color([nextColor.r, nextColor.g, nextColor.b, 0]),
                    stop: colorStop.stop
                };
 
                this.colorStops.splice(i + 1, 0, newColorStop);
            }
        }
    }

    if (this.colorStops[0].stop === null) {
        this.colorStops[0].stop = 0;
    }

    if (this.colorStops[this.colorStops.length - 1].stop === null) {
        this.colorStops[this.colorStops.length - 1].stop = 1;
    }

    // calculates and fills-in explicit stop positions when omitted from rule
    this.colorStops.forEach(function(colorStop, index) {
        if (colorStop.stop === null) {
            this.colorStops.slice(index).some(function(find, count) {
                if (find.stop !== null) {
                    colorStop.stop = ((find.stop - this.colorStops[index - 1].stop) / (count + 1)) + this.colorStops[index - 1].stop;
                    return true;
                } else {
                    return false;
                }
            }, this);
        }
    }, this);
};

GradientContainer.TYPES = {
    LINEAR: 1,
    RADIAL: 2,
    REPEATING_LINEAR: 3,
    REPEATING_RADIAL: 4
};

// TODO: negative %/length values
// TODO: support <angle> (e.g. -?\d{1,3}(?:\.\d+)deg, etc. : https://developer.mozilla.org/docs/Web/CSS/angle )
//GradientContainer.REGEXP_COLORSTOP = /^\s*(rgba?\(\s*\d{1,3},\s*\d{1,3},\s*\d{1,3}(?:,\s*[0-9\.]+)?\s*\)|[a-z]{3,20}|#[a-f0-9]{3,6})(?:\s+(\d{1,3}(?:\.\d+)?)(%|px)?)?(?:\s|$)/i;

// with hsl[a] support
GradientContainer.REGEXP_COLORSTOP = /^\s*(rgba?\(\s*\d{1,3},\s*\d{1,3},\s*\d{1,3}(?:,\s*[0-9\.]+)?\s*\)|hsla?\(\s*\d{1,3},\s*\d{1,3}%,\s*\d{1,3}%(?:,\s*[0-9\.]+)?\s*\)|[a-z]{3,20}|#[a-f0-9]{3,6})(?:\s+(\d{1,3}(?:\.\d+)?)(%|px)?)?(?:\s|$)/i;

module.exports = GradientContainer;
