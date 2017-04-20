var GradientContainer = require('./gradientcontainer');
var Color = require('./color');

function RadialGradientContainer(imageData) {
    GradientContainer.apply(this, arguments);
    this.type = GradientContainer.TYPES.RADIAL;

    var m = imageData.args[0].match(RadialGradientContainer.REGEXP_SHAPEDEF);
    if (m) {
        // TODO

        this.parseColorStops(imageData.args.splice(1));
    } else {
        this.parseColorStops(imageData.args);
    }
}

RadialGradientContainer.prototype = Object.create(GradientContainer.prototype);

RadialGradientContainer.REGEXP_SHAPEDEF = /^\s*(circle|ellipse)?\s*((?:([\d.]+)(px|%)\s*(?:([\d.]+)(px|%))?)|closest-side|closest-corner|farthest-side|farthest-corner)?\s*(?:at\s*([\d.]+)(px|%)\s+([\d.]+)(px|%))?(?:\s|$)/i;

module.exports = RadialGradientContainer;
