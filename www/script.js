/* globals App, io, cabin*/
const ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.stunprotocol.org:3478" },
    { urls: "stun:stun.sipnet.net:3478" },
    { urls: "stun:stun.ideasip.com:3478" },
    { urls: "stun:stun.iptel.org:3478" },
    { urls: "turn:numb.viagenie.ca", username: "taein2370@gmail.com", credential: "numbserver050910" },
    {
        urls: [
            "turn:173.194.72.127:19305?transport=udp",
            "turn:[2404:6800:4008:C01::7F]:19305?transport=udp",
            "turn:173.194.72.127:443?transport=tcp",
            "turn:[2404:6800:4008:C01::7F]:443?transport=tcp",
        ],
        username: "CKjCuLwFEgahxNRjuTAYzc/s6OMT",
        credential: "u1SQDR/SQsPQIxXNWQT7czc/G4c=",
    },
];

const APP_URL = (() => {
    const protocol = "http" + (location.hostname == "localhost" ? "" : "s") + "://";
    return protocol + location.hostname + (location.hostname == "localhost" ? ":3000" : "");
})();

const ROOM_ID = (() => {
    let roomName = location.pathname.substring(1);
    if (!roomName) {
        roomName = Math.random()
            .toString(36)
            .substr(2, 6);
        window.history.pushState({ url: `${APP_URL}/${roomName}` }, roomName, `${APP_URL}/${roomName}`);
    }
    return roomName;
})();

const USE_AUDIO = true;
const USE_VIDEO = true;

let signalingSocket = null; /* our socket.io connection to our webserver */
let localMediaStream = null; /* our own microphone / webcam */
let peers = {}; /* keep track of our peer connections, indexed by peer_id (aka socket.io id) */
let peerMediaElements = {}; /* keep track of our <video>/<audio> tags, indexed by peer_id */
let dataChannels = {};

function init() {
    App.roomLink = `${APP_URL}/${ROOM_ID}`;

    signalingSocket = io(APP_URL);
    signalingSocket = io();

    signalingSocket.on("connect", function() {
        if (localMediaStream) joinChatChannel(ROOM_ID, {});
        else
            setupLocalMedia(function() {
                joinChatChannel(ROOM_ID, {});
                render('success', "환영합니다 :)", 3000);
            });
    });
    signalingSocket.on("disconnect", function() {
        for (let peer_id in peerMediaElements) {
            document.getElementById("videos").removeChild(peerMediaElements[peer_id].parentNode);
            resizeVideos();
        }
        for (let peer_id in peers) {
            peers[peer_id].close();
        }

        peers = {};
        peerMediaElements = {};
    });

    function joinChatChannel(channel, userdata) {
        signalingSocket.emit("join", { channel: channel, userdata: userdata });
    }

    signalingSocket.on("addPeer", function(config) {
        const peer_id = config.peer_id;
        if (peer_id in peers) return;

        const peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS }, { optional: [{ DtlsSrtpKeyAgreement: true }] });
        peers[peer_id] = peerConnection;

        peerConnection.onicecandidate = function(event) {
            if (event.candidate) {
                signalingSocket.emit("relayICECandidate", {
                    peer_id: peer_id,
                    ice_candidate: {
                        sdpMLineIndex: event.candidate.sdpMLineIndex,
                        candidate: event.candidate.candidate,
                    },
                });
            }
        };
        peerConnection.onaddstream = function(event) {
            render('info', "상대방이 참여했습니다", 3000);
            var audio = new Audio('tone/join.mp3');
            audio.play();
            const remoteMedia = getVideoElement(peer_id);
            peerMediaElements[peer_id] = remoteMedia;
            attachMediaStream(remoteMedia, event.stream);
            resizeVideos();
            App.showIntro = false;
        };
        peerConnection.ondatachannel = function(event) {
            console.log("Datachannel event" + peer_id, event);
            event.channel.onmessage = (msg) => {
                let chatMessage = {};
                try {
                    chatMessage = JSON.parse(msg.data);
                    App.handleIncomingDataChannelMessage(chatMessage);
                } catch (err) {
                    console.log(err);
                }
            };
        };

        /* Add our local stream */
        peerConnection.addStream(localMediaStream);
        dataChannels[peer_id] = peerConnection.createDataChannel("talk__data_channel");

        if (config.should_create_offer) {
            peerConnection.createOffer(
                (localDescription) => {
                    peerConnection.setLocalDescription(
                        localDescription,
                        () => {
                            signalingSocket.emit("relaySessionDescription", {
                                peer_id: peer_id,
                                session_description: localDescription,
                            });
                        },
                        () => alert("Offer setLocalDescription failed!")
                    );
                },
                (error) => console.log("Error sending offer: ", error)
            );
        }
    });

    signalingSocket.on("sessionDescription", function(config) {
        const peer_id = config.peer_id;
        const peer = peers[peer_id];
        const remoteDescription = config.session_description;

        const desc = new RTCSessionDescription(remoteDescription);
        peer.setRemoteDescription(
            desc,
            () => {
                if (remoteDescription.type == "offer") {
                    peer.createAnswer(
                        (localDescription) => {
                            peer.setLocalDescription(
                                localDescription,
                                () => {
                                    signalingSocket.emit("relaySessionDescription", {
                                        peer_id: peer_id,
                                        session_description: localDescription,
                                    });
                                },
                                () => alert("Answer setLocalDescription failed!")
                            );
                        },
                        (error) => console.log("Error creating answer: ", error)
                    );
                }
            },
            (error) => console.log("setRemoteDescription error: ", error)
        );
    });

    signalingSocket.on("iceCandidate", function(config) {
        const peer = peers[config.peer_id];
        const iceCandidate = config.ice_candidate;
        peer.addIceCandidate(new RTCIceCandidate(iceCandidate));
    });

    signalingSocket.on("removePeer", function(config) {
        render('warning', "상대방이 나갔습니다", 3000);
        const peer_id = config.peer_id;
        if (peer_id in peerMediaElements) {
            document.getElementById("videos").removeChild(peerMediaElements[peer_id].parentNode);
            resizeVideos();
        }
        if (peer_id in peers) {
            peers[peer_id].close();
        }
        delete dataChannels[peer_id];
        delete peers[peer_id];
        delete peerMediaElements[config.peer_id];
    });
}
const attachMediaStream = (element, stream) => (element.srcObject = stream);

function setupLocalMedia(callback, errorback) {
    if (localMediaStream != null) {
        if (callback) callback();
        return;
    }

    navigator.mediaDevices
        .getUserMedia({ audio: USE_AUDIO, video: USE_VIDEO })
        .then((stream) => {
            localMediaStream = stream;
            const localMedia = getVideoElement(null, true);
            attachMediaStream(localMedia, stream);
            resizeVideos();
            if (callback) callback();

            navigator.mediaDevices.enumerateDevices().then((devices) => {
                App.videoDevices = devices.filter((device) => device.kind === "videoinput" && device.deviceId !== "default");
                App.audioDevices = devices.filter((device) => device.kind === "audioinput" && device.deviceId !== "default");
            });
        })
        .catch((err) => {
            /* user denied access to a/v */
            if (err.name.includes('NotReadableError')) {
                render('danger', "다른 앱에서 마이크나 카메라를 사용중입니다. 다른 앱을 종료한 후 시도해주세요.", 4500);
            } else {
                render('danger', "마이크/카메라 오류 : " + err.name + "-" + err.message, 4000);

            }

            if (errorback) errorback();
        });
}

const getVideoElement = (peerId, isLocal) => {
    const videoWrap = document.createElement("div");
    videoWrap.className = "video";
    const media = document.createElement("video");
    media.setAttribute("playsinline", true);
    media.autoplay = true;
    media.controls = false;
    if (isLocal) {
        media.setAttribute("id", "selfVideo");
        media.className = "mirror";
        media.muted = true;
        media.volume = 0;
    } else {
        media.mediaGroup = "remotevideo";
    }
    const fullScreenBtn = document.createElement("button");
    fullScreenBtn.className = "icon-maximize";
    fullScreenBtn.addEventListener("click", () => {
        if (videoWrap.requestFullscreen) {
            videoWrap.requestFullscreen();
        } else if (videoWrap.webkitRequestFullscreen) {
            videoWrap.webkitRequestFullscreen();
        }
    });

    videoWrap.setAttribute("id", peerId || "");
    videoWrap.appendChild(media);
    videoWrap.appendChild(fullScreenBtn);
    document.getElementById("videos").appendChild(videoWrap);
    return media;
};

const resizeVideos = () => {
    const numToString = ["", "one", "two", "three", "four", "five", "six"];
    const videos = document.querySelectorAll("#videos .video");
    document.querySelectorAll("#videos .video").forEach((v) => {
        v.className = "video " + numToString[videos.length];
    });

    var windowWidth = window.matchMedia("screen and (max-width: 960px)");
    if (windowWidth.matches) {
        console.log('m');
        $('#player').css({
            width: '87%',
            height: '25vh'
        });

        $('#chats').css({ top: $('.video').outerHeight() + 30 + 'px' });
        $('#chats').css({ height: $(window).height() - $('.video').outerHeight() - 100 + 'px' });
    } else {
        console.log('p');
        $('#player').css({
            width: '65%',
            height: '50vh'
        });
    }




};

window.onresize = function(event) {
    var windowWidth = window.matchMedia("screen and (max-width: 960px)");
    if (windowWidth.matches) {
        $('#chats').css({ position: 'absolute', width: '100%', height: '70%' });

        $('#chats').css({ top: $('.video').outerHeight() + 30 + 'px' });
        $('#chats').css({ height: $(window).height() - $('.video').outerHeight() - 100 + 'px' });
    } else {
        $('#chats').css({ position: 'fixed', top: '20px', right: '0', width: '30%', height: '87%' });

    }

};

$('.close-modal').click(function() {
    $('.modal-overlay, .modal').removeClass('active');
});

window.onload = init;


// data
var clear;
var msgDuration = 3000;
var $msgSuccess = 'Great job! Well done :)';
var $msgDanger = 'Careful with that!';
var $msgWarning = 'Try that again and see what happens';
var $msgInfo = 'This is a friendly reminder';
// cache DOM
var $msg = $('.msg');
var $btnSuccess = $('.btn-success');
var $btnDanger = $('.btn-danger');
var $btnWarning = $('.btn-warning');
var $btnInfo = $('.btn-info');

// render message
function render(type, message, duration) {

    msgDuration = duration;
    hide();

    switch (type) {
        case 'success':
            $msg.addClass('msg-success active').text(message);
            break;
        case 'danger':
            $msg.addClass('msg-danger active').text(message);
            break;
        case 'warning':
            $msg.addClass('msg-warning active').text(message);
            break;
        case 'info':
            $msg.addClass('msg-info active').text(message);
            break;
    }
    timer()
}

function timer() {
    clearTimeout(clear);
    clear = setTimeout(function() {
        hide();
    }, msgDuration)
}

function hide() {
    $msg.removeClass('msg-success msg-danger msg-warning msg-info active');
}