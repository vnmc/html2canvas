/* global Areion: true */

function ProxyImageContainer(src, proxy) {
    var self = this;
    this.src = src;
    this.image = new Image();
    this.tainted = null;

    this.promise = new Promise(function(resolve, reject) {
        self.image.onload = resolve;
        self.image.onerror = reject;

        self.image.src = Areion.rewriteUrl(src);

        if (self.image.complete === true) {
            resolve(self.image);
        }
    });
}

module.exports = ProxyImageContainer;
