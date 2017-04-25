var GradientContainer = require('./gradientcontainer');
var Color = require('./color');

function RadialGradientContainer(imageData) {
    GradientContainer.apply(this, arguments);
    this.type = GradientContainer.TYPES.RADIAL;

    var m = imageData.args[0].match(RadialGradientContainer.REGEXP_SHAPEDEF);
    if (m) {
        this.isCircle =
            m[1] === 'circle' || // explicit shape specification
            (m[3] !== undefined && m[5] === undefined); // only one radius coordinate

        this.radius = {
            descriptor: m[2] || 'farthest-corner'
        };

        if (m[3] !== undefined) {
            this.radius.x = {
                value: parseFloat(m[3]) * (m[4] === '%' ? 0.01 : 1),
                isRelative: m[4] === '%'
            };
        }
        if (m[5] !== undefined) {
            this.radius.y = {
                value: parseFloat(m[5]) * (m[6] === '%' ? 0.01 : 1),
                isRelative: m[6] === '%'
            };
        }

        this.position = {};
        if (m[7] !== undefined) {
            this.position.x = {
                value: parseFloat(m[7]) * (m[8] === '%' ? 0.01 : 1),
                isRelative: m[8] === '%'
            };
        }
        if (m[9] !== undefined) {
            this.position.y = {
                value: parseFloat(m[9]) * (m[10] === '%' ? 0.01 : 1),
                isRelative: m[10] === '%'
            };
        }

        this.parseColorStops(imageData.args.splice(1));
    } else {
        this.isCircle = false;
        this.radius = { descriptor: 'farthest-corner' };
        this.position = {};

        this.parseColorStops(imageData.args);
    }

    // set values if not set
    if (this.position.x === undefined) {
        // center
        this.position.x = { value: 0.5, isRelative: true };
    }
    if (this.position.y === undefined) {
        this.position.y = { value: 0.5, isRelative: true };
    }
}

RadialGradientContainer.prototype = Object.create(GradientContainer.prototype);

RadialGradientContainer.REGEXP_SHAPEDEF = /^\s*(circle|ellipse)?\s*((?:([\d.]+)(px|%)\s*(?:([\d.]+)(px|%))?)|closest-side|closest-corner|farthest-side|farthest-corner)?\s*(?:at\s*([\d.]+)(px|%)\s+([\d.]+)(px|%))?(?:\s|$)/i;

module.exports = RadialGradientContainer;
