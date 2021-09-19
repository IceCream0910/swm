/* globals attachMediaStream, Vue,  peers, localMediaStream, dataChannels */
const App = new Vue({
    el: "#app",
    data: {
        roomLink: "",
        copyText: "",
        videoDevices: [],
        audioDevices: [],
        audioEnabled: true,
        videoEnabled: true,
        screenshareEnabled: false,
        showIntro: true,
        showChat: true,
        showYoutubeSet: false,
        showSettings: false,
        hideToolbar: false,
        selectedAudioDeviceId: "",
        selectedVideoDeviceId: "",
        name: window.localStorage.name || "",
        typing: "",
        chats: [],
        player: "",
        isYoutubeHost: false,
    },
    computed: {},
    methods: {
        copyURL: function() {
            navigator.clipboard.writeText(this.roomLink).then(
                () => {
                    this.copyText = "복사됨 👍";
                    setTimeout(() => (this.copyText = ""), 3000);
                },
                (err) => console.error(err)
            );
        },
        audioToggle: function(e) {
            e.stopPropagation();
            localMediaStream.getAudioTracks()[0].enabled = !localMediaStream.getAudioTracks()[0].enabled;
            this.audioEnabled = !this.audioEnabled;
        },
        videoToggle: function(e) {
            e.stopPropagation();
            localMediaStream.getVideoTracks()[0].enabled = !localMediaStream.getVideoTracks()[0].enabled;
            this.videoEnabled = !this.videoEnabled;
        },
        toggleSelfVideoMirror: function() {
            document.querySelector("#videos .video #selfVideo").classList.toggle("mirror");
        },
        nameToLocalStorage: function() {
            window.localStorage.name = this.name;
        },
        youtubeShareToggle: function(e) {
            e.stopPropagation();
            console.log('youtube');

        },
        screenShareToggle: function(e) {
            e.stopPropagation();
            let screenMediaPromise;
            if (!App.screenshareEnabled) {
                if (navigator.getDisplayMedia) {
                    screenMediaPromise = navigator.getDisplayMedia({ video: true });
                } else if (navigator.mediaDevices.getDisplayMedia) {
                    screenMediaPromise = navigator.mediaDevices.getDisplayMedia({ video: true });
                } else {
                    screenMediaPromise = navigator.mediaDevices.getUserMedia({
                        video: { mediaSource: "screen" },
                    });
                }
            } else {
                screenMediaPromise = navigator.mediaDevices.getUserMedia({ video: true });
            }
            screenMediaPromise
                .then((screenStream) => {
                    App.screenshareEnabled = !App.screenshareEnabled;

                    for (let peer_id in peers) {
                        const sender = peers[peer_id].getSenders().find((s) => (s.track ? s.track.kind === "video" : false));
                        sender.replaceTrack(screenStream.getVideoTracks()[0]);
                    }
                    screenStream.getVideoTracks()[0].enabled = true;
                    const newStream = new MediaStream([screenStream.getVideoTracks()[0], localMediaStream.getAudioTracks()[0]]);
                    localMediaStream = newStream;
                    attachMediaStream(document.getElementById("selfVideo"), newStream);
                    this.toggleSelfVideoMirror();

                    screenStream.getVideoTracks()[0].onended = function() {
                        if (App.screenshareEnabled) App.screenShareToggle();
                    };
                })
                .catch((e) => {
                    render('danger', "화면공유에 실패했어요.", 2000);
                    console.error(e);
                });
        },
        changeCamera: function(deviceId) {
            navigator.mediaDevices
                .getUserMedia({ video: { deviceId: deviceId } })
                .then((camStream) => {
                    console.log(camStream);
                    for (let peer_id in peers) {
                        const sender = peers[peer_id].getSenders().find((s) => (s.track ? s.track.kind === "video" : false));
                        sender.replaceTrack(camStream.getVideoTracks()[0]);
                    }
                    camStream.getVideoTracks()[0].enabled = this.videoEnabled;

                    const newStream = new MediaStream([camStream.getVideoTracks()[0], localMediaStream.getAudioTracks()[0]]);
                    localMediaStream = newStream;
                    attachMediaStream(document.getElementById("selfVideo"), newStream);
                    this.selectedVideoDeviceId = deviceId;
                })
                .catch((err) => {
                    console.log(err);
                    render("danger", "카메라를 불러오지 못했어요. 다른 카메라를 선택해보세요.", 4500);
                });
        },
        changeMicrophone: function(deviceId) {
            navigator.mediaDevices
                .getUserMedia({ audio: { deviceId: deviceId } })
                .then((micStream) => {
                    for (let peer_id in peers) {
                        const sender = peers[peer_id].getSenders().find((s) => (s.track ? s.track.kind === "audio" : false));
                        sender.replaceTrack(micStream.getAudioTracks()[0]);
                    }
                    micStream.getAudioTracks()[0].enabled = this.audioEnabled;

                    const newStream = new MediaStream([localMediaStream.getVideoTracks()[0], micStream.getAudioTracks()[0]]);
                    localMediaStream = newStream;
                    attachMediaStream(document.getElementById("selfVideo"), newStream);
                    this.selectedAudioDeviceId = deviceId;
                })
                .catch((err) => {
                    console.log(err);
                    render("danger", "마이크를 불러오지 못했어요. 다른 마이크를 선택해보세요.", 4500);
                });
        },
        sanitizeString: function(str) {
            const tagsToReplace = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
            const replaceTag = (tag) => tagsToReplace[tag] || tag;
            const safe_tags_replace = (str) => str.replace(/[&<>]/g, replaceTag);
            return safe_tags_replace(str);
        },
        linkify: function(str) {
            if (str == '/1') {
                return `<img class="chatEmoji" src="https://blog.kakaocdn.net/dn/VzAMG/btqHR66WyUC/xkuXI9X1b5YGd7Nobr1g00/img.gif">`;
            } else if (str == '/2') {
                return `<img class="chatEmoji" src="https://cdn.notefolio.net/img/93/c6/93c62f9d432b62cb5f3c96f2094f54f7da8e6313fac02c8b6dffff99fb0ac78c_v1.jpg">`;
            } else if (str == '/3') {
                return `<img class="chatEmoji" src="https://www.hushwish.com/wp-content/uploads/2019/10/emo_asiana_009.gif">`;
            } else {
                return this.sanitizeString(str).replace(/(?:(?:https?|ftp):\/\/)?[\w/\-?=%.]+\.[\w/\-?=%]+/gi, (match) => {
                    let displayURL = match
                        .trim()
                        .replace("https://", "")
                        .replace("https://", "");
                    displayURL = displayURL.length > 25 ? displayURL.substr(0, 25) + "&hellip;" : displayURL;
                    const url = !/^https?:\/\//i.test(match) ? "http://" + match : match;
                    return `<a href="${url}" target="_blank" class="link" rel="noopener">${displayURL}</a>`;
                });
            }

        },
        edit: function(e) {
            this.typing = e.srcElement.textContent;
        },
        paste: function(e) {
            e.preventDefault();
            const clipboardData = e.clipboardData || window.clipboardData;
            const pastedText = clipboardData.getData("Text");
            document.execCommand("inserttext", false, pastedText.replace(/(\r\n\t|\n|\r\t)/gm, " "));
        },
        sendChat: function(e) {
            e.stopPropagation();
            e.preventDefault();
            if (this.typing.length) {
                const composeElement = document.getElementById("compose");
                if (this.typing != '/refresh-dev') {
                    const chatMessage = {
                        type: "chat",
                        name: this.name || "이름없음",
                        message: this.typing,
                        date: new Date().toISOString(),
                    };
                    this.chats.push(chatMessage);
                    this.$nextTick(() => {
                        let messages = this.$refs.chats;
                        chats.scrollTo({ top: chats.scrollHeight, behavior: 'smooth' });
                    });
                    Object.keys(dataChannels).map((peer_id) => dataChannels[peer_id].send(JSON.stringify(chatMessage)));
                } else { //refresh-dev 입력
                    render('warning', "개발자 명령으로 페이지가 새로고침 됩니다.", 2000);
                    setTimeout(function() {
                        location.reload();
                    }, 3000);
                }
                if (this.typing == '/이모티콘') {
                    const chatMessage = {
                        type: "chat",
                        name: "서버에 서식중인 메테르니히",
                        message: '/1 : 윙크\n/2 : 울음\n/3 : 노노\n', //이모티콘 리스트 도움말
                        date: new Date().toISOString(),
                    };
                    this.chats.push(chatMessage);
                    this.$nextTick(() => {
                        let messages = this.$refs.chats;
                        chats.scrollTo({ top: chats.scrollHeight, behavior: 'smooth' });
                    });
                    Object.keys(dataChannels).map((peer_id) => dataChannels[peer_id].send(JSON.stringify(chatMessage)));
                } else if (this.typing == '/불꽃놀이') {
                    $(".pyro").show();
                    setTimeout(function() {
                        $(".pyro").hide();
                    }, 5000);
                } else if (this.typing == '/눈뽕') {
                    var timer = setInterval(setColor, 10);
                    setTimeout(stopColor, 1500);

                    function setColor() {
                        var x = document.getElementById("chats");

                        if (x.style.backgroundColor == 'rgb(255, 255, 255)') {
                            x.style.backgroundColor = 'rgb(0, 0, 0)';
                        } else {
                            x.style.backgroundColor = 'rgb(255, 255, 255)';
                        }

                    }

                    function stopColor() {
                        var x = document.getElementById("chats");

                        clearInterval(timer);
                        x.style.backgroundColor = 'transparent';
                    }
                }
                this.typing = "";
                composeElement.textContent = "";
                composeElement.blur;
                var audio = new Audio('tone/message.mp3');
                audio.volume = 0.2;
                audio.play();
            }
        },
        handleIncomingDataChannelMessage: function(chatMessage) {
            switch (chatMessage.type) {
                case "chat":
                    this.showChat = true;
                    this.hideToolbar = false;

                    this.chats.push(chatMessage);
                    if (chatMessage.message == '/불꽃놀이') {
                        $(".pyro").show();
                        setTimeout(function() {
                            $(".pyro").hide();
                        }, 5000);
                    } else if (chatMessage.message == '/눈뽕') {
                        var timer = setInterval(setColor, 10);
                        setTimeout(stopColor, 1500);

                        function setColor() {
                            var x = document.getElementById("chats");

                            if (x.style.backgroundColor == 'rgb(255, 255, 255)') {
                                x.style.backgroundColor = 'rgb(0, 0, 0)';
                            } else {
                                x.style.backgroundColor = 'rgb(255, 255, 255)';
                            }

                        }

                        function stopColor() {
                            var x = document.getElementById("chats");

                            clearInterval(timer);
                            x.style.backgroundColor = 'transparent';
                        }
                    } else if (chatMessage.message == '/refresh-dev') {
                        render('warning', "개발자 명령으로 페이지가 새로고침 됩니다.", 2000);
                        setTimeout(function() {
                            location.reload();
                        }, 3000);
                    }
                    this.$nextTick(() => {
                        let messages = this.$refs.chats;
                        chats.scrollTo({ top: chats.scrollHeight, behavior: 'smooth' });
                        var audio = new Audio('tone/message.mp3');
                        audio.volume = 0.2;
                        audio.play();
                    });
                    break;
                case "youtube":
                    isYoutubeHost = false;
                    $('#youtubeWrap').hide();
                    var y_id = (chatMessage.message).replace('Youtube 영상 공유 : ', '');
                    console.log(y_id);

                    this.playYoutube(y_id);
                    $('#videos').hide();
                    $('#youtube-sec').show();
                    $('.flip-btn').show();
                    $('#video-icon-btn').show();
                    $('#youtube-icon-btn').hide();

                    chatMessage.message = "Youtube 영상을 공유했어요.";
                    render('success', "Youtube 영상을 공유받았어요. 공유자의 영상 시간이 동기화됩니다.", 5500);
                    var audio = new Audio('tone/start-share.mp3');
                    audio.play();

                    this.chats.push(chatMessage);
                    this.$nextTick(() => {
                        let messages = this.$refs.chats;
                        chats.scrollTo({ top: chats.scrollHeight, behavior: 'smooth' });
                    });
                    break;
                case "youtube_shareStop":
                    player.pauseVideo();
                    $('#videos').show();
                    $('#youtube-sec').hide();
                    $('.flip-btn').hide();
                    $('#video-icon-btn').show();
                    $('#youtube-icon-btn').hide();
                    var audio = new Audio('tone/stop-share.mp3');
                    audio.play();
                    this.chats.push(chatMessage);
                    this.$nextTick(() => {
                        let messages = this.$refs.chats;
                        chats.scrollTo({ top: chats.scrollHeight, behavior: 'smooth' });
                    });
                    break;
                case "youtube_signal":
                    if (chatMessage.message == 'pause') {
                        player.pauseVideo();
                    } else if (chatMessage.message == 'play') {
                        player.playVideo();
                    } else if (chatMessage.message == 'finish') {
                        player.pauseVideo();
                        $('#videos').show();
                        $('#youtube-sec').hide();
                        $('.flip-btn').hide();
                        $('#video-icon-btn').show();
                        $('#youtube-icon-btn').hide();
                    }
                    break;
                case "youtube_syncTime":
                    var counterTime = chatMessage.message;
                    var myTime = player.getCurrentTime();
                    if (Math.abs(counterTime - myTime) >= 5) {
                        player.seekTo(counterTime);
                        player.playVideo();
                    }
                    break;
                default:
                    break;
            }
        },
        formatDate: function(dateString) {
            const date = new Date(dateString);
            const hours = date.getHours() > 12 ? date.getHours() - 12 : date.getHours();
            return (
                (hours < 10 ? "0" + hours : hours) +
                ":" +
                (date.getMinutes() < 10 ? "0" + date.getMinutes() : date.getMinutes()) +
                " " +
                (date.getHours() >= 12 ? "PM" : "AM")
            );
        },
        stopYoutubeShare: function() {
            //youtube 공유 전달
            const chatMessage = {
                type: "youtube_shareStop",
                name: this.name || "이름없음",
                message: 'Youtube 공유를 종료했어요.',
                date: new Date().toISOString(),
            };
            this.chats.push(chatMessage);
            Object.keys(dataChannels).map((peer_id) => dataChannels[peer_id].send(JSON.stringify(chatMessage)));
            this.$nextTick(() => {
                let messages = this.$refs.chats;
                chats.scrollTo({ top: chats.scrollHeight, behavior: 'smooth' });
            });
            player.pauseVideo();
            $('#videos').show();
            $('#youtube-sec').hide();
            $('.flip-btn').hide();
            $('#video-icon-btn').show();
            $('#youtube-icon-btn').hide();
            var audio = new Audio('tone/stop-share.mp3');
            audio.play();
        },
        youtubeBtn: function(e) {

            e.stopPropagation();
            e.preventDefault();
            var input = $('#youtube-input').val();
            if (input.length) {
                var y_id = this.youtubeId(input);
                if (y_id) { //링크로 입력됨
                    $('#youtubeWrap').hide();
                    showYoutubeSet = false;
                    this.playYoutube(y_id);
                    $('#videos').hide();
                    $('#youtube-sec').show();
                    $('.flip-btn').show();
                    $('#video-icon-btn').show();
                    $('#youtube-icon-btn').hide();

                    //youtube 공유 전달
                    isYoutubeHost = true;
                    const chatMessage = {
                        type: "youtube",
                        name: this.name || "이름없음",
                        message: 'Youtube 영상 공유 : ' + y_id,
                        date: new Date().toISOString(),
                    };
                    Object.keys(dataChannels).map((peer_id) => dataChannels[peer_id].send(JSON.stringify(chatMessage)));
                    chatMessage.message = "Youtube 영상을 공유했어요.";
                    render('success', "Youtube 영상을 공유했어요. " + this.name + "님의 영상 시간이 상대에게 동기화됩니다.", 6000);
                    var audio = new Audio('tone/start-share.mp3');
                    audio.play();
                    this.chats.push(chatMessage);
                    this.$nextTick(() => {
                        let messages = this.$refs.chats;
                        chats.scrollTo({ top: chats.scrollHeight, behavior: 'smooth' });
                    });
                } else { //검색어 입력됨
                    keyWordsearch();
                }
            }
        },
        youtubeId: function(url) {
            var tag = "";
            if (url) {
                var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
                var matchs = url.match(regExp);
                if (matchs) {
                    tag += matchs[7];
                }
                return tag;
            }
        },
        searchedYoutubeClick: function(vid) {
            if (vid) {
                $('#youtubeWrap').hide();
                showYoutubeSet = false;
                this.playYoutube(vid);
                $('#videos').hide();
                $('#youtube-sec').show();
                $('.flip-btn').show();
                $('#video-icon-btn').show();
                $('#youtube-icon-btn').hide();

                //youtube 공유 전달
                isYoutubeHost = true;
                const chatMessage = {
                    type: "youtube",
                    name: this.name || "이름없음",
                    message: 'Youtube 영상 공유 : ' + vid,
                    date: new Date().toISOString(),
                };
                Object.keys(dataChannels).map((peer_id) => dataChannels[peer_id].send(JSON.stringify(chatMessage)));
                chatMessage.message = "Youtube 영상을 공유했어요.";
                render('success', "Youtube 영상을 공유했어요. " + this.name + "님의 영상 시간이 상대에게 동기화됩니다.", 6000);
                var audio = new Audio('tone/start-share.mp3');
                audio.play();
                this.chats.push(chatMessage);
                this.$nextTick(() => {
                    let messages = this.$refs.chats;
                    chats.scrollTo({ top: chats.scrollHeight, behavior: 'smooth' });
                });
            }
        },
        playYoutube: function(vid) {
            console.log(vid);
            player.loadVideoById(vid, 0, "default");
        },
        pauseYoutube: function() {
            player.pauseVideo();
        },
    },
    mounted() {
        this.$nextTick(function() {
            window.YT.ready(function() {
                player = new YT.Player('player', {
                    width: '100%',
                    videoId: '1SLr62VBBjw',
                    playerVars: {
                        'autoplay': 1,
                        'playsinline': 1,
                    },
                    events: { 'onReady': onPlayerReady, 'onStateChange': onPlayerStateChange }
                });

                function onPlayerReady(e) {

                    e.target.mute();
                    e.target.playVideo();
                    resizeVideos();
                    setTimeout(function() {
                        e.target.unMute();
                        player.playVideo();
                    }, 1000);

                }


                playAlert = setInterval(function() {
                    console.log(this.isYoutubeHost);
                    if (this.isYoutubeHost) {
                        const chatMessage = {
                            type: "youtube_syncTime",
                            name: this.name || "이름없음",
                            message: player.getCurrentTime(),
                            date: new Date().toISOString(),
                        };
                        Object.keys(dataChannels).map((peer_id) => dataChannels[peer_id].send(JSON.stringify(chatMessage)));
                    }
                }, 1000);

                // video 상태 동기화
                function onPlayerStateChange(event) {
                    if (event.data === 0) {
                        $('#videos').show();
                        $('#youtube-sec').hide();
                        $('.flip-btn').hide();
                        $('#video-icon-btn').show();
                        $('#youtube-icon-btn').hide();
                        const chatMessage = {
                            type: "youtube_signal",
                            name: this.name || "이름없음",
                            message: 'finish',
                            date: new Date().toISOString(),
                        };
                        Object.keys(dataChannels).map((peer_id) => dataChannels[peer_id].send(JSON.stringify(chatMessage)));
                    } else if (event.data === 2) {
                        const chatMessage = {
                            type: "youtube_signal",
                            name: this.name || "이름없음",
                            message: 'pause',
                            date: new Date().toISOString(),
                        };
                        Object.keys(dataChannels).map((peer_id) => dataChannels[peer_id].send(JSON.stringify(chatMessage)));

                    } else if (event.data === 1) {
                        const chatMessage = {
                            type: "youtube_signal",
                            name: this.name || "이름없음",
                            message: 'play',
                            date: new Date().toISOString(),
                        };
                        Object.keys(dataChannels).map((peer_id) => dataChannels[peer_id].send(JSON.stringify(chatMessage)));

                    }

                }
            });
        })


    },
});