var Color = require('./color');
var utils = require('./utils');
var getBounds = utils.getBounds;
var parseBackgrounds = utils.parseBackgrounds;
var offsetBounds = utils.offsetBounds;

function NodeContainer(node, parent) {
    this.node = node;
    this.parent = parent;
    this.stack = null;
    this.bounds = null;
    this.borders = null;
    this.clip = [];
    this.backgroundClip = [];
    this.canvasBorder = [];
    this.offsetBounds = null;
    this.visible = null;
    this.computedStyles = null;
    this.colors = {};
    this.styles = {};
    this.backgroundImages = null;
    this.transformData = null;
    this.transformMatrix = null;
    this.isPseudoElement = false;
    this.opacity = null;
}

NodeContainer.prototype.cloneTo = function(stack) {
    stack.visible = this.visible;
    stack.borders = this.borders;
    stack.bounds = this.bounds;
    stack.clip = this.clip;
    stack.backgroundClip = this.backgroundClip;
    stack.canvasBorder = this.canvasBorder;
    stack.computedStyles = this.computedStyles;
    stack.styles = this.styles;
    stack.backgroundImages = this.backgroundImages;
    stack.opacity = this.opacity;
};

NodeContainer.prototype.getOpacity = function() {
    return this.opacity === null ? (this.opacity = this.cssFloat('opacity')) : this.opacity;
};

NodeContainer.prototype.assignStack = function(stack) {
    this.stack = stack;
    stack.children.push(this);
};

NodeContainer.prototype.isElementVisible = function() {
    return this.node.nodeType === Node.TEXT_NODE ? this.parent.visible : (
        this.css('display') !== "none" &&
        this.css('visibility') !== "hidden" &&
        (this.css('overflow') === "visible" || (this.cssInt('width') !== 0 && this.cssInt('height') !== 0)) &&
        !this.node.hasAttribute("data-html2canvas-ignore") &&
        (this.node.nodeName !== "INPUT" || this.node.getAttribute("type") !== "hidden")
    );
};

NodeContainer.prototype.css = function(attribute) {
    if (!this.computedStyles) {
        this.computedStyles = this.isPseudoElement ? this.parent.computedStyle(this.before ? ":before" : ":after") : this.computedStyle(null);
    }

    return this.styles[attribute] || (this.styles[attribute] = this.computedStyles[attribute]);
};

NodeContainer.prototype.prefixedCss = function(attribute) {
    var prefixes = ["webkit", "moz", "ms", "o"];
    var value = this.css(attribute);
    if (value === undefined) {
        prefixes.some(function(prefix) {
            value = this.css(prefix + attribute.substr(0, 1).toUpperCase() + attribute.substr(1));
            return value !== undefined;
        }, this);
    }
    return value === undefined ? null : value;
};

NodeContainer.prototype.computedStyle = function(type) {
    return this.node.ownerDocument.defaultView.getComputedStyle(this.node, type);
};

NodeContainer.prototype.cssInt = function(attribute) {
    var value = parseInt(this.css(attribute), 10);
    return (isNaN(value)) ? 0 : value; // borders in old IE are throwing 'medium' for demo.html
};

NodeContainer.prototype.color = function(attribute) {
    return this.colors[attribute] || (this.colors[attribute] = new Color(this.css(attribute)));
};

NodeContainer.prototype.cssFloat = function(attribute) {
    var value = parseFloat(this.css(attribute));
    return (isNaN(value)) ? 0 : value;
};

NodeContainer.prototype.fontWeight = function() {
    var weight = this.css("fontWeight");
    switch(parseInt(weight, 10)){
    case 401:
        weight = "bold";
        break;
    case 400:
        weight = "normal";
        break;
    }
    return weight;
};

NodeContainer.prototype.parseClip = function() {
    var matches = this.css('clip').match(this.CLIP);
    if (matches) {
        return {
            top: parseInt(matches[1], 10),
            right: parseInt(matches[2], 10),
            bottom: parseInt(matches[3], 10),
            left: parseInt(matches[4], 10)
        };
    }
    return null;
};

NodeContainer.prototype.parseBackgroundImages = function() {
    return this.backgroundImages || (this.backgroundImages = parseBackgrounds(this.css("backgroundImage")));
};


NodeContainer.prototype.parseBackgroundSize = function(bounds, image, index) {
    var size = (this.css("backgroundSize") || '').split(',');
    size = size[index || 0] || size[0] || 'auto';
    size = size.trim().split(' ');
    if (size.length === 1) {
        size.push('auto');
    }

    var width, height;

    if (isPercentage(size[0])) {
        width = bounds.width * parseFloat(size[0]) / 100;
    } else if (/contain|cover/.test(size[0])) {
        var targetRatio = bounds.width / bounds.height, currentRatio = image.width / image.height;
        return (targetRatio < currentRatio ^ size[0] === 'contain') ?  {width: bounds.height * currentRatio, height: bounds.height} : {width: bounds.width, height: bounds.width / currentRatio};
    } else {
        width = parseInt(size[0], 10);
    }

    if (size[0] === 'auto' && size[1] === 'auto') {
        height = image.height;
    } else if (size[1] === 'auto') {
        height = width / image.width * image.height;
    } else if (isPercentage(size[1])) {
        height =  bounds.height * parseFloat(size[1]) / 100;
    } else {
        height = parseInt(size[1], 10);
    }

    if (size[0] === 'auto') {
        width = height / image.height * image.width;
    }

    return {width: width, height: height};
};

NodeContainer.prototype.parseBackgroundPosition = function(bounds, image, index, backgroundSize) {
    var positionX = this.css('backgroundPositionX');
    var bgPosition = this.css('backgroundPosition');
    var positionY;
    if (positionX === undefined) {
        // the properties "backgroundPositionX" and "backgroundPositionY" don't exist; parse "backgroundPosition"
        var position = bgPosition.split(/\s+/);
        if (position.length === 1) {
            // 1 value syntax:
            // - keyword "top", "left", "bottom", "right" => other dimension is set to "50%"
            // - length or percentage: specifies x-coordinate relative to left edge; y set to "50%"
            // (https://developer.mozilla.org/en-US/docs/Web/CSS/background-position)

            positionX = position[0];
            if (positionX === "top" || positionX === "bottom") {
                positionY = positionX;
                positionX = "50%";
            } else {
                positionY = "50%";
            }
        } else {
            // 2 value syntax
            positionX = position[0];
            positionY = position[1];
        }
    } else {
        // the properties "backgroundPositionX" and "backgroundPositionY" exist
        positionY = this.css('backgroundPositionY');
    }

    var left, top;
    if (positionX === 'left') {
        left = 0;
    } else if (positionX === 'center') {
        left = (bounds.width - (backgroundSize || image).width) * 0.5;
    } else if (positionX === 'right') {
        left = bounds.width - (backgroundSize || image).width;
    } else if (isPercentage(positionX)){
        left = (bounds.width - (backgroundSize || image).width) * (parseFloat(positionX) / 100);
    } else if (bgPosition.indexOf('right') === 0) {
        left = bounds.width - (backgroundSize || image).width - parseInt(positionX, 10);
    } else {
        left = parseInt(positionX, 10);
    }

    if (positionY === 'auto') {
        top = left / image.width * image.height;
    } else if (positionY === 'top') {
        top = 0;
    } else if (positionY === 'center') {
        top =  (bounds.height - (backgroundSize || image).height) * 0.5;
    } else if (positionY === 'bottom') {
        top =  bounds.height - (backgroundSize || image).height;
    } else if (isPercentage(positionY)){
        top =  (bounds.height - (backgroundSize || image).height) * parseFloat(positionY) / 100;
    } else if (bgPosition.indexOf('bottom') !== -1) {
        top = bounds.height - (backgroundSize || image).height - parseInt(positionY, 10);
    } else {
        top = parseInt(positionY, 10);
    }

    if (positionX === 'auto') {
        left = top / image.height * image.width;
    }

    return {left: left, top: top};
};

NodeContainer.prototype.parseBackgroundOrigin = function(bounds, index) {
    var borderLeft = this.cssInt('borderLeftWidth');
    var borderRight = this.cssInt('borderRightWidth');
    var borderTop = this.cssInt('borderTopWidth');
    var borderBottom = this.cssInt('borderBottomWidth');

    switch (this.css("backgroundOrigin")) {
    case "content-box":
        var paddingLeft = this.cssInt('paddingLeft');
        var paddingRight = this.cssInt('paddingRight');
        var paddingTop = this.cssInt('paddingTop');
        var paddingBottom = this.cssInt('paddingBottom');

        return {
            left: bounds.left + paddingLeft,
            top: bounds.top + paddingTop,
            right: bounds.right - paddingRight,
            bottom: bounds.bottom - paddingBottom,
            width: bounds.width - paddingLeft - paddingRight - borderLeft - borderRight,
            height: bounds.height - paddingTop - paddingBottom - borderTop - borderBottom
        };

    case "padding-box":
        return {
            left: bounds.left,
            top: bounds.top,
            right: bounds.right,
            bottom: bounds.bottom,
            width: bounds.width - borderLeft - borderRight,
            height: bounds.height - borderTop - borderBottom
        };

    case "border-box":
        return {
            left: bounds.left - borderLeft,
            top: bounds.top - borderTop,
            right: bounds.right + borderRight,
            bottom: bounds.bounds + borderBottom,
            width: bounds.width,
            height: bounds.height
        };
    }
};

NodeContainer.prototype.parseBackgroundRepeat = function(index) {
    return this.css("backgroundRepeat");
};

NodeContainer.prototype.parseTextShadows = function() {
    var textShadow = this.css("textShadow");
    var results = [];

    if (textShadow && textShadow !== 'none') {
        var shadows = textShadow.match(this.TEXT_SHADOW_PROPERTY);
        for (var i = 0; shadows && (i < shadows.length); i++) {
            var s = shadows[i].match(this.TEXT_SHADOW_VALUES);
            results.push({
                color: new Color(s[0]),
                offsetX: s[1] ? parseFloat(s[1].replace('px', '')) : 0,
                offsetY: s[2] ? parseFloat(s[2].replace('px', '')) : 0,
                blur: s[3] ? parseFloat(s[3].replace('px', '')) : 0
            });
        }
    }
    return results;
};

NodeContainer.prototype.parseTransform = function() {
    if (!this.transformData) {
        if (this.hasTransform()) {
            var offset = this.parseBounds();
            var origin = this.prefixedCss("transformOrigin").split(" ").map(removePx).map(asFloat);
            origin[0] += offset.left;
            origin[1] += offset.top;
            this.transformData = {
                origin: origin,
                matrix: this.parseTransformMatrix()
            };
        } else {
            this.transformData = {
                origin: [0, 0],
                matrix: [1, 0, 0, 1, 0, 0]
            };
        }
    }
    return this.transformData;
};

NodeContainer.prototype.parseTransformMatrix = function() {
    if (!this.transformMatrix) {
        var transform = this.prefixedCss("transform");
        var matrix = transform ? parseMatrix(transform.match(this.MATRIX_PROPERTY)) : null;
        this.transformMatrix = matrix ? matrix : [1, 0, 0, 1, 0, 0];
    }
    return this.transformMatrix;
};

NodeContainer.prototype.inverseTransform = function() {
    var transformData = this.parseTransform();
    var inverseOrigin = [];
    for (var i = 0; i < transformData.origin.length; i++) {
        inverseOrigin.push(-transformData.origin[i]);
    }
    return { origin: inverseOrigin, matrix: utils.matrixInverse(transformData.matrix) };
};

NodeContainer.prototype.parseBounds = function() {
    return this.bounds || (this.bounds = this.hasTransform() ? offsetBounds(this.node) : getBounds(this.node));
};

NodeContainer.prototype.hasTransform = function() {
    return this.parseTransformMatrix().join(",") !== "1,0,0,1,0,0" || (this.parent && this.parent.hasTransform());
};

NodeContainer.prototype.getValue = function() {
    var value = this.node.value || "";
    if (this.node.tagName === "SELECT") {
        value = selectionValue(this.node);
    } else if (this.node.type === "password") {
        value = Array(value.length + 1).join('\u2022'); // jshint ignore:line
    }
    return value.length === 0 ? (this.node.placeholder || "") : value;
};

NodeContainer.prototype.isPlaceholderShown = function() {
    return this.node.tagName !== "SELECT" && !this.node.value && !!this.node.placeholder;
};

NodeContainer.prototype.MATRIX_PROPERTY = /(matrix|matrix3d)\((.+)\)/;
NodeContainer.prototype.TEXT_SHADOW_PROPERTY = /((rgba|rgb)\([^\)]+\)(\s-?\d+px){0,})/g;
NodeContainer.prototype.TEXT_SHADOW_VALUES = /(-?\d+px)|(#.+)|(rgb\(.+\))|(rgba\(.+\))/g;
NodeContainer.prototype.CLIP = /^rect\((\d+)px,? (\d+)px,? (\d+)px,? (\d+)px\)$/;

function selectionValue(node) {
    var option = node.options[node.selectedIndex || 0];
    return option ? (option.text || "") : "";
}

function parseMatrix(match) {
    if (match && match[1] === "matrix") {
        return match[2].split(",").map(function(s) {
            return parseFloat(s.trim());
        });
    } else if (match && match[1] === "matrix3d") {
        var matrix3d = match[2].split(",").map(function(s) {
          return parseFloat(s.trim());
        });
        return [matrix3d[0], matrix3d[1], matrix3d[4], matrix3d[5], matrix3d[12], matrix3d[13]];
    }
}

function isPercentage(value) {
    return value.toString().indexOf("%") !== -1;
}

function removePx(str) {
    return str.replace("px", "");
}

function asFloat(str) {
    return parseFloat(str);
}

module.exports = NodeContainer;
