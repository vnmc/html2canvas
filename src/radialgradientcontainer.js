var GradientContainer = require('./gradientcontainer');
var Color = require('./color');

function RadialGradientContainer(imageData, container) {
    GradientContainer.apply(this, arguments);
    this.type = GradientContainer.TYPES.RADIAL;

    var rootFontSize;
    var fontSize;
    var node = container && container.node;

    var getFontSize = function(node) {
        if (!node) {
            return 16;
        }

        var style = getComputedStyle(node);
        if (!style) {
            return 16;
        }

        var m = style.fontSize.match(/([\d.]+)(px|r?em|%)/i);
        if (!m) {
            return 16;
        }

        var v = parseFloat(m[1]);

        switch (m[2]) {
        case 'px':
            return v;
        case 'em':
            return v * getFontSize(node.parentElement);
        case 'rem':
            return v * getFontSize((node.ownerDocument || document).body);
        case '%':
            return v * 0.01 * getFontSize(node.parentElement);
        }

        return 16;
    };

    var getPixelOrPercentSize = function(value, unit) {
        var v = parseFloat(value);
        var size;

        switch (unit) {
        case 'px':
            return v;
        case 'em':
            if (!fontSize) {
                fontSize = getFontSize(node);
            }
            return v * fontSize;
        case 'rem':
            if (!rootFontSize) {
                rootFontSize = getFontSize(((node && node.ownerDocument) || document).body);
            }
            return v * rootFontSize;
        case '%':
            return v * 0.01;
        }
    };

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
                value: getPixelOrPercentSize(m[3], m[4]),
                isRelative: m[4] === '%'
            };
        }
        if (m[5] !== undefined) {
            this.radius.y = {
                value: getPixelOrPercentSize(m[5], m[6]),
                isRelative: m[6] === '%'
            };
        }

        this.position = {};
        if (m[7] !== undefined) {
            this.position.x = {
                value: getPixelOrPercentSize(m[7], m[8]),
                isRelative: m[8] === '%'
            };
        }
        if (m[9] !== undefined) {
            this.position.y = {
                value: getPixelOrPercentSize(m[9], m[10]),
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

RadialGradientContainer.REGEXP_SHAPEDEF = /^\s*(circle|ellipse)?\s*((?:([\d.]+)(px|r?em|%)\s*(?:([\d.]+)(px|r?em|%))?)|closest-side|closest-corner|farthest-side|farthest-corner)?\s*(?:at\s*([\d.]+)(px|r?em|%)\s+([\d.]+)(px|r?em|%))?(?:\s|$)/i;

module.exports = RadialGradientContainer;
