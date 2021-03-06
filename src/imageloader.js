var log = require('./log');
var ImageContainer = require('./imagecontainer');
var VideoContainer = require('./videocontainer');
var DummyImageContainer = require('./dummyimagecontainer');
var ProxyImageContainer = require('./areion_proxyimagecontainer');
var ProxyVideoContainer = require('./areion_proxyvideocontainer');
var FrameContainer = require('./framecontainer');
var SVGContainer = require('./svgcontainer');
var SVGNodeContainer = require('./svgnodecontainer');
var LinearGradientContainer = require('./lineargradientcontainer');
var RadialGradientContainer = require('./radialgradientcontainer');
var RepeatingLinearGradientContainer = require('./repeatinglineargradientcontainer');
var RepeatingRadialGradientContainer = require('./repeatingradialgradientcontainer');
var WebkitGradientContainer = require('./webkitgradientcontainer');
var bind = require('./utils').bind;

function ImageLoader(options, support) {
    this.link = null;
    this.options = options;
    this.support = support;
    this.origin = this.getOrigin(window.location.href);
}

ImageLoader.prototype.findImages = function(nodes) {
    var images = [];
    var videoIndex = 0;
    nodes.reduce(function(imageNodes, container) {
        switch(container.node.nodeName) {
        case "IMG":
            return imageNodes.concat([{
                args: [container.node.currentSrc || container.node.src],
                method: "url"
            }]);
        case "VIDEO":
            return imageNodes.concat([{
                args: [container.node],
                videoIndex: videoIndex++,
                method: "VIDEO"
            }]);
        case "svg":
        case "IFRAME":
            return imageNodes.concat([{
                args: [container.node],
                method: container.node.nodeName
            }]);
        }
        return imageNodes;
    }, []).forEach(this.addImage(images, this.loadImage), this);
    return images;
};

ImageLoader.prototype.findBackgroundImage = function(images, container) {
    container.parseBackgroundImages().filter(this.hasImageBackground).forEach(this.addImage(images, this.loadImage, container), this);

    var image = container.parseListStyleImage();
    if (image) {
        this.addImage(images, this.loadImage, container).call(this, image);
    }

    return images;
};

ImageLoader.prototype.addImage = function(images, callback, container) {
    return function(newImage) {
        newImage.args.forEach(function(image) {
            if (!this.imageExists(images, image)) {
                images.splice(0, 0, callback.call(this, newImage, container));
                log('Added image #' + (images.length), typeof(image) === "string" ? image.substring(0, 100) : image);
            }
        }, this);
    };
};

ImageLoader.prototype.hasImageBackground = function(imageData) {
    return imageData.method !== "none";
};

ImageLoader.prototype.loadImage = function(imageData, container) {
    if (this.options.cancel) {
        return;
    }

    if (imageData.method === "url") {
        var src = imageData.args[0];
        if (this.isSVG(src) && !this.support.svg && !this.options.allowTaint) {
            return new SVGContainer(src);
        } else if (src.match(/data:image\/.*;base64,/i)) {
            return new ImageContainer(src.replace(/url\(['"]{0,}|['"]{0,}\)$/ig, ''), false);
        } else if (this.isSameOrigin(src) || this.options.allowTaint === true || this.isSVG(src)) {
            return new ImageContainer(src, false);
        } else if (this.support.cors && !this.options.allowTaint && this.options.useCORS) {
            return new ImageContainer(src, true);
        } else if (this.options.proxy) {
            return new ProxyImageContainer(src, this.options.proxy);
        } else {
            return new DummyImageContainer(src);
        }
    } else if (imageData.method === "linear-gradient") {
        return new LinearGradientContainer(imageData);
    } else if (imageData.method === "radial-gradient") {
        return new RadialGradientContainer(imageData, container);
    } else if (imageData.method === "repeating-linear-gradient") {
        return new RepeatingLinearGradientContainer(imageData);
    } else if (imageData.method === "repeating-radial-gradient") {
        return new RepeatingRadialGradientContainer(imageData, container);
    } else if (imageData.method === "gradient") {
        return new WebkitGradientContainer(imageData);
    } else if (imageData.method === "svg") {
        return new SVGNodeContainer(imageData.args[0], this.support.svg);
    } else if (imageData.method === "IFRAME") {
        return new FrameContainer(imageData.args[0], this.isSameOrigin(imageData.args[0].src), this.options);
    } else if (imageData.method === "VIDEO") {
        var videoSrc = imageData.args[0].currentSrc || imageData.args[0].src;
        if (this.isSameOrigin(videoSrc) || this.options.allowTaint === true) {
            return new VideoContainer(imageData);
        } else {
            return new ProxyVideoContainer(imageData);
        }
    } else {
        return new DummyImageContainer(imageData);
    }
};

ImageLoader.prototype.isSVG = function(src) {
    return /\.svg(?:$|\?|#)/i.test(src) || SVGContainer.prototype.isInline(src);
};

ImageLoader.prototype.imageExists = function(images, src) {
    return images.some(function(image) {
        return image.src === src;
    });
};

ImageLoader.prototype.isSameOrigin = function(url) {
    return (this.getOrigin(url) === this.origin);
};

ImageLoader.prototype.getOrigin = function(url) {
    var link = this.link || (this.link = document.createElement("a"));
    link.href = url;
    link.href = link.href; // IE9, LOL! - http://jsfiddle.net/niklasvh/2e48b/
    return link.protocol + link.hostname + link.port;
};

ImageLoader.prototype.getPromise = function(container) {
    return this.timeout(container, this.options.imageTimeout)['catch'](function() {
        var dummy = new DummyImageContainer(container.src);
        return dummy.promise.then(function(image) {
            container.image = image;
        });
    });
};

ImageLoader.prototype.get = function(src) {
    var found = null;
    return this.images.some(function(img) {
        return (found = img).src === src;
    }) ? found : null;
};

ImageLoader.prototype.getVideo = function(videoIndex) {
    var found = null;
    return this.images.some(function(img) {
        return (found = img).videoIndex === videoIndex;
    }) ? found : null;
};

ImageLoader.prototype.fetch = function(nodes) {
    this.images = nodes.reduce(bind(this.findBackgroundImage, this), this.findImages(nodes));
    this.images.forEach(function(image, index) {
        image.promise.then(function() {
            log("Succesfully loaded image #"+ (index+1), image);
        }, function(e) {
            log("Failed loading image #"+ (index+1), image, e);
        });
    });
    this.ready = Promise.all(this.images.map(this.getPromise, this));
    log("Finished searching images");
    return this;
};

ImageLoader.prototype.timeout = function(container, timeout) {
    var timer;
    var promise = Promise.race([container.promise, new Promise(function(res, reject) {
        timer = setTimeout(function() {
            log("Timed out loading image", container);
            reject(container);
        }, timeout);
    })]).then(function(container) {
        clearTimeout(timer);
        return container;
    });
    promise['catch'](function() {
        clearTimeout(timer);
    });
    return promise;
};

module.exports = ImageLoader;
