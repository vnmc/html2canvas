/* global Areion: true */

function ProxyVideoContainer(imageData) {
    var video = imageData.args[0];
    this.src = video.currentSrc || video.src;

    // Adding index to identify the video element as <video> can have multiple child <source>.
    this.videoIndex = imageData.videoIndex;
    video.videoIndex = imageData.videoIndex;
    this.image = video;

    video.src = Areion.rewriteUrl(this.src);

    this.promise = new Promise(function(resolve, reject) {
        video.muted = true;
        var originalVideos = document.getElementsByTagName('video');

        if (originalVideos.length !== 0 && originalVideos[imageData.videoIndex]) {
            var originalVideo = originalVideos[imageData.videoIndex];
            if (originalVideo.currentTime) {
                video.currentTime = originalVideo.currentTime;
            }

            if (!video.paused) {
                resolve();
            } else {
                var playPromise = video.play();
                if (playPromise) {
                    playPromise.then(resolve, reject);
                } else {
                    resolve();
                }
            }
        } else {
            resolve();
        }
    });
}

module.exports = ProxyVideoContainer;
