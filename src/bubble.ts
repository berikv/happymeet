import "jqueryui";
import { addEmojis, checkEmojis } from "./emojis";
import { makeResizable, resize } from "./resizer";
import { log, VIDEO_KEY, debug } from './util';
import { findName, sendMessage } from './util';

export class Bubble {
    static myBubble: Bubble;
    static allBubbles: { [key:string]:Bubble; } = {};

    userId: string;
    node: JQuery;
    picture: JQuery;
    video: JQuery;
    ssrc: string;
    name: string;
  
    constructor(container: JQuery, video: JQuery, img: JQuery, userId: string) {
        this.userId = userId;
        this.video = video;
        this.ssrc = video.parent().attr("data-ssrc");
        this.picture  = img;
        this.name = findName(container, userId);
        this.node = this.createNode();
        this.watchBubbleVolume(container);
        if (this.checkIfMyBubble(container)) {
            this.node.addClass("me");
            this.changed("Found my bubble");
            this.makeDraggable();
            makeResizable(this);
            addEmojis(this);
        }
        debug("User joined, add bubble", userId);
        Bubble.allBubbles[userId] = this;
        log("New bubble", this.name, this);
    }

    addVideo(video: JQuery) {
        this.node
            .appendTo(".happymeet .bubbles")
            .find(".clip")
            .append(
                $(`video[userId="${this.userId}]`),
                video
                    .addClass("happymeet")
                    .attr("userId", this.userId),
            );
    }

    watchBubbleVolume(container: JQuery) {
        const bubble = this;
        const volumeter = container.find("div[data-second-screen]");
        const clip = bubble.node.find(".clip");
        const position = clip.position();
        var lastRingShown = new Date().getTime();
        var lastClass = "";
        function addRing() {
            const now = new Date().getTime();
            if (now - lastRingShown < 300) return;
            lastRingShown = now;
            const currentClass = volumeter.attr("class");
            if (currentClass == lastClass) return;
            lastClass = currentClass;
            $("<div>")
                .addClass("ring")
                .prependTo(bubble.node)
                .css({
                    borderWidth: 8,
                    opacity: 0.5,
                    top: position.top - 4,
                    left: position.left - 4,
                    width: clip.width(),
                    height: clip.height(),
                })
                .animate({
                    borderWidth: 1,
                    top: position.top - 40,
                    left: position.left - 40,
                    width: clip.width() + 80,
                    height: clip.height() + 80,
                    opacity: 0,
                }, 1500, function() { $(this).remove(); });
        }
        if (volumeter.length == 0) return;
        new MutationObserver(addRing).observe(volumeter[0], { attributes: true });
    }

    checkIfMyBubble(container: JQuery): boolean {
        Bubble.showMyBubble();
        const name = container.find("div[data-self-name]").first();
        if (!this.name.length || name.attr("data-self-name") != name.text()) return false;
        Bubble.myBubble = this;
        this.node.appendTo(".happymeet .bubbles");
        return true;
    }

    makeDraggable() {
        this.node.draggable({
            scroll: false,
            containment: ".happymeet .bubbles",
            drag: (event, ui) => {
                this.changed("User dragged bubble");
            },
        });
    }

    static createBubble(container: JQuery, video: JQuery, img: JQuery, userId: string) {
        var bubble = this.allBubbles[userId];
        if (!bubble) {
            bubble = new Bubble(container, video, img, userId);
        }
        bubble.addVideo(video.parent());
        bubble.node.css("opacity", 1);
    }

    reparentVideo() {
        this.video
            .css("opacity", 1)
            .removeClass("happymeet")
            .appendTo($(`div[data-ssrc="${this.ssrc}"]`));
    }

    static reparentVideos() {
        for (const userId in Bubble.allBubbles) {
            Bubble.allBubbles[userId].reparentVideo();
        }
    }

    createNode(): JQuery<HTMLElement> {
        return $("<div>")
            .attr("id", this.userId)
            .attr("userId", this.userId)
            .addClass("bubble")
            .prependTo(".happymeet .bubbles")
            .css({
                    position: "absolute",
                    top: 200 + Math.random() * 200,
                    left: Math.random() * 200,
                })
                .append(
                    $("<div>")
                        .text(this.userId + "-" + this.name)
                        .addClass("name"),
                    $("<div>")
                        .addClass("clip")
                        .append(this.picture)
                );
    }

    changed(reason: string): void {
        const position = this.node.position();
        if (!position) return;
        sendMessage({
            type: "update-bubble",
            userId: this.userId, 
            reason,
            leftRatio: position.left / $(".bubbles").width(),
            topRatio: position.top / $(".bubbles").height(),
            sizeRatio: this.node.width() / $(".bubbles").width(),
        });
        checkEmojis(this);
    }

    static getBubble(userId: string): Bubble {
        return Bubble.allBubbles[userId];
    }

    update(leftRatio: number, topRatio: number, sizeRatio: number): void {
        if (this == Bubble.myBubble) return;
        this.node
            .css({
                left: leftRatio * $(".bubbles").width(),
                top: topRatio * $(".bubbles").height(),
            });
        resize(this, sizeRatio * $(".bubbles").width());
        checkEmojis(this);
    }

    static showMyBubble() {
        if ($(".bubble.me").position()) return;
        // force my video to show up as a tile, so HappyMeet can discover it
    }

    static isPerson(container: JQuery, userId: string) {
        const name = findName(container, userId);
        if (name && name.indexOf("(") !== -1) return false;
        return true;
    }

};

function updateBubble(message) {
    const bubble = Bubble.getBubble(message.userId);
    if (bubble) {
        bubble.update(message.leftRatio, message.topRatio, message.sizeRatio);
    } else {
        setTimeout(() => updateBubble(message), 1000);
    }
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    debug("handle message", message.type)
    switch (message.type) {
        case "update-bubble":
            updateBubble(message);
            sendResponse("OK");
            break;
        case "leave-meeting":
            const bubble = Bubble.allBubbles[message.userId];
            bubble.node
                .find("video").appendTo($(".bubbles"))
                .remove();
            delete Bubble.allBubbles[message.userId];
            break;
        case "start-meeting":
            if (Bubble.myBubble) {
                Bubble.myBubble.changed("Received start-meeting event");
            }
            sendResponse("OK");
            break;
    }
});
