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
                $('#loader').fadeOut(300);
            });
    });
    window.addEventListener('beforeunload', function() {
        userLeft();
    }, false);

    window.addEventListener('keyup', function(e) {
        if (e.keyCode == 116)
            userLeft();
    }, false);

    function userLeft() { //방 나가기
        database.ref('users/' + userid).update({
            currentRoomID: ''
        });
    }

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
            if (peer_id) {
                document.getElementById("videos-others").removeChild(peerMediaElements[peer_id].parentNode);
            } else {
                document.getElementById("videos").removeChild(peerMediaElements[peer_id].parentNode);

            }
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
    //loadBodyPix(media);
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

    const time_text = document.createElement("h1");
    time_text.className = "time_text";
    time_text.setAttribute("id", "today_stime");

    if (peerId) {
        videoWrap.setAttribute("id", peerId || "");
        videoWrap.appendChild(media);
        videoWrap.appendChild(fullScreenBtn);
        document.getElementById("videos-others").appendChild(videoWrap);
        return media;
    } else {
        videoWrap.setAttribute("id", peerId || "");
        videoWrap.appendChild(media);
        videoWrap.appendChild(fullScreenBtn);
        videoWrap.appendChild(time_text);
        document.getElementById("videos").appendChild(videoWrap);
        return media;
    }

};

const resizeVideos = () => {
    const numToString = ["", "one", "two", "three", "four", "five", "six"];
    const videos = document.querySelectorAll("#videos .video");
    document.querySelectorAll("#videos .video").forEach((v) => {
        v.className = "video " + numToString[videos.length];
    });

    var windowWidth = window.matchMedia("screen and (max-width: 960px)");
    if (windowWidth.matches) {
        $('#player').css({
            width: '100%',
            height: '25vh',
            margin: '0',
        });
        $('#player').css('margin-top', '20px');
        $('#player').css('border-radius', '0 0 20px 20px');


        $('#videos-others').css({ top: $('.video').outerHeight() + 30 + 'px' });

        $('#chats').css({ position: 'absolute', width: '100%' });

        $('#chats').css({ top: $('#videos-others').offset().top + $('#videos-others').outerHeight() + 30 + 'px' });
        $('#chats').css({ height: $(window).height() - ($('#videos-others').offset().top + $('#videos-others').outerHeight()) - 100 + 'px' });
    } else {
        console.log('p');
        $('#videos-others').css({ top: '0px' });
        $('#chats').css({ top: $('#videos-others').outerHeight() + 30 + 'px', height: $(window).height() - $('#videos-others').outerHeight() - 100 + 'px' });

        $('#player').css({
            width: '55%',
            height: '50vh'
        });
        $('#player').css('margin', '20px');
        $('#player').css('border-radius', '20px');

    }
};

function loadBodyPix(target) {
    options = {
        multiplier: 0.75,
        stride: 32,
        quantBytes: 4
    }
    bodyPix.load(options)
        .then(net => perform(net, target))
        .catch(err => console.log(err))
}

async function perform(net, target) {
    const segmentation = await net.segmentPerson(target);

    const backgroundBlurAmount = 6;
    const edgeBlurAmount = 2;
    const flipHorizontal = true;

    bodyPix.drawBokehEffect(
        canvas, videoElement, segmentation, backgroundBlurAmount,
        edgeBlurAmount, flipHorizontal);
}


///계정 데이터베이스 연동
// Initialize Firebase
var config = {
    apiKey: "AIzaSyBSMucNkAiYFvqlFMwfx0wJwaBm4Ch02TY",
    authDomain: "studywith-27574.firebaseapp.com",
    databaseURL: "https://studywith-27574-default-rtdb.firebaseio.com",
    projectId: "studywith-27574",
    storageBucket: "studywith-27574.appspot.com",
    messagingSenderId: "552036737705",
    appId: "1:552036737705:web:0678b231cb1e78fc3b3fb8",
    measurementId: "G-4KJ0ZW7E91"
};
firebase.initializeApp(config);

// Get a reference to the database service
var database = firebase.database();

var userid = '';
const todayDate = new Date().toISOString();

$.ajax({
    type: "GET",
    url: "../auth/profile",
    success: function(result) {
        if (result == "unlogin") {
            window.localStorage.name = '';
            location.href = 'login.html'
        } else {
            window.localStorage.name = result.nickname;
            userid = result.id;
            username = result.nickname;
            useremail = result.email;
            //현재 상태 업데이트
            database.ref('users/' + userid).update({
                currentRoomID: ROOM_ID,
            });
        }

    }
});

var accumulatedTime = 0;
var isCompleteDataChecking = 0;


var messageRef = firebase.database().ref('users').orderByChild("studyTime").startAt(0);
messageRef.on('value', (snapshot) => {
    const data = snapshot.val();
    updateUserList(data, snapshot.numChildren());
});

function updateUserList(data, length) {
    var userlist = {};

    var cnt = 0;
    $.each(data, function(key, value) {
        userlist[cnt] = value;
        cnt++;
    });

    var today = todayDate.toString().substring(0, 10);
    var foundValue = Object.values(userlist).filter(user => user.uid === userid);


    if (foundValue[0].lastStudy.toString().indexOf(today) != -1) {

        accumulatedTime = parseInt(foundValue[0].studyTime);
        $('#today_stime').html(msToHMS(Number(foundValue[0].studyTime)));
        //현재 상태 업데이트


    } else {
        accumulatedTime = 0;
        //현재 상태 업데이트
        database.ref('users/' + userid).update({
            studyTime: '0',
            lastStudy: todayDate,
        });
    }
    isCompleteDataChecking = 1;


}

function msToHMS(ms) {
    // 1- Convert to seconds:
    var seconds = ms / 1000;
    // 2- Extract hours:
    var hours = parseInt(seconds / 3600).toString().padStart(2, '0'); // 3,600 seconds in 1 hour
    seconds = seconds % 3600; // seconds remaining after extracting hours
    // 3- Extract minutes:
    var minutes = parseInt(seconds / 60).toString().padStart(2, '0'); // 60 seconds in 1 minute
    // 4- Keep only seconds not extracted to minutes:
    seconds = (seconds % 60).toString().padStart(2, '0');
    if (hours == 0) {
        return (minutes + ":" + seconds);
    } else { return (hours + ":" + minutes + ":" + seconds); }

}


savedata = setInterval(function() {
    if (isCompleteDataChecking == 1) {
        accumulatedTime = accumulatedTime + 1000;
        database.ref('users/' + userid).update({
            studyTime: accumulatedTime.toString()
        });
    }

}, 1000);

window.onresize = function(event) {
    var windowWidth = window.matchMedia("screen and (max-width: 960px)");
    if (windowWidth.matches) {
        $('#player').css({
            width: '100%',
            height: '25vh',
            margin: '0',
        });
        $('#player').css('margin-top', '20px');
        $('#player').css('border-radius', '0 0 20px 20px');

        $('#videos-others').css({ top: $('.video').outerHeight() + 30 + 'px' });
        $('#chats').css({ position: 'absolute', width: '100%' });

        $('#chats').css({ top: $('#videos-others').offset().top + $('#videos-others').outerHeight() + 30 + 'px' });
        $('#chats').css({ height: $(window).height() - ($('#videos-others').offset().top + $('#videos-others').outerHeight()) - 100 + 'px' });
    } else {
        $('#player').css({
            width: '55%',
            height: '50vh'
        });
        $('#player').css('margin', '20px');
        $('#player').css('border-radius', '20px');

        $('#videos-others').css({ top: '0px' });
        $('#chats').css({ position: 'fixed', top: $('#videos-others').outerHeight() + 30 + 'px', right: '0', width: '30%', height: $(window).height() - ($('#videos-others').offset().top + $('#videos-others').outerHeight()) - 100 + 'px' });

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