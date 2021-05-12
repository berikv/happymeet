import { Job, VIDEO_KEY, sanitizeId, log, findPin } from './util';
import { triggerMouseClick, sendMessage } from './util';
import { Bubble } from './bubble';
import { bottomMenu, findMenus } from './menus';
import { findPresentationPreview, Presentation } from './presentation';

type Message = any;

class HappyMeet {
    static enabled = false;
    inMeeting = false;
    domChecker = new Job("DOM Checker", this.check.bind(this));

    constructor() {
        const happymeet = this;
        $("body").on("DOMSubtreeModified", function() {
            happymeet.domChecker.schedule(100);
        });
        chrome.runtime.onMessage.addListener((message: Message, sender: chrome.runtime.MessageSender, sendResponse: (Message) => void) => {
            switch (message.type) {
                case "start-meeting":
                    if (Bubble.myBubble) {
                        Bubble.myBubble.changed("Received start-meeting event");
                    }
                    sendResponse("OK");
                    break;
            }
        });
        $(window).on("resize", this.centerButton);
    }

    check() {
        this.checkMeetingStatus();
        if (!HappyMeet.enabled || !this.inMeeting) return;
        Bubble.findUsersThatLeft();
        this.findNewVideos();
        findPresentationPreview();
        Presentation.check();
    }

    checkMeetingStatus() {
        $("div[role='button'] i:contains('present_to_all')").each(this.checkPresentButton.bind(this));
    }

    findNewVideos() {
        if (!this.inMeeting) return;
        $(`div[${VIDEO_KEY}]`).each(function () {
            const container = $(this);
            const video = container.find("video");
            const img = container.find("img");
            if (video.length == 0 && img.length == 0 || video.hasClass("happymeet")) return;
            if (Presentation.isPresentation(container, video)) {
                const userId = sanitizeId(container.attr(VIDEO_KEY));
                new Presentation(video, userId);
            }
            if (Bubble.isPerson(container, video, img)) {
                Bubble.createBubble(container, video, img);
            }
            HappyMeet.hideMeetUI();
        });
    }

    static getMeetUI() {
        return $(`div[${VIDEO_KEY}]`).parent().parent();
    }

    static hideMeetUI() {
        HappyMeet.getMeetUI().css({
            opacity: 0,
        });
        $(".happymeet").css({
            opacity: 1,
        });
    }

    static showMeetUI() {
        HappyMeet.getMeetUI().css({
            opacity: 1,
        });
        $(".happymeet").css({
            opacity: 0,
        });
    }

    addHappyMeet() {
        if ($(".happymeet").position() || !bottomMenu) return;
        $("<div>")
            .addClass("happymeet")
            .append($("<div>")
                .addClass("presentation")
                .append($("<div class='message'>Waiting for someone to present...</div>"))
            )
            .append($("<div>")
                .addClass("bubbles")
            )
            .prependTo(bottomMenu.parent());
    }

    showCaptionDivs() {
        $("div")
            .filter((index, element) => {
                const div = $(element);
                return (div.height() > 100 && parseInt(div.css("bottom")) > 50);
            })
            .css({
                bottom: 8,
                zIndex: 100,
            })
    }

    checkPresentButton(index: number, element: Element) {
        const node = $(element);
        const presentNowButton = node.closest("div[role='button']");
        const joinButton = presentNowButton.parent().children().first();
        if (presentNowButton.height() >= 80) {
            if (!this.inMeeting) {
                sendMessage({ type: "start-meeting" });
            }
            this.inMeeting = true;
            if (HappyMeet.enabled) {
                findMenus();
            }
        } else {
            if (this.inMeeting) {
                sendMessage({ type: "stop-meeting" });
            }
            this.inMeeting = false;
        }
        if (presentNowButton.height() < 80 && !$(".joinhappymeet").position()) {
            $("<button>")
                .addClass("joinhappymeet")
                .text("Join with HappyMeet")
                .on("click", () => {
                    if (HappyMeet.enabled) return;
                    HappyMeet.enabled = true;
                    triggerMouseClick(joinButton.find("span"));
                    $(".joinhappymeet").remove();
                })
                .appendTo($("body"));
        }
        this.centerButton();
        if (HappyMeet.enabled) {
            this.addHappyMeet();
            this.showCaptionDivs();
        }
    }

    centerButton() {
        $(".joinhappymeet")
            .css({
                top: 10,
                left: $("body").width()/2 - 60,
            })
    }

    static disable() {
        HappyMeet.showMeetUI();
        HappyMeet.enabled = false;
        Bubble.reparentVideos();
        Presentation.reparentVideos();
    }

    static enable() {
        HappyMeet.hideMeetUI();
        HappyMeet.enabled = true;
    }
}

$("body")
    .on("keyup", event => {
        switch (event.which) {
            case 77: // m
                HappyMeet.disable();
                break;
            case 72: // h
                HappyMeet.enable();
                break;
        }
    });


new HappyMeet();