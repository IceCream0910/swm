const express = require("express");
const path = require("path");
const http = require("http");
const app = express();
const server = http.createServer(app);
const nunjucks = require('nunjucks');
const axios = require('axios');
const qs = require('qs');
const session = require('express-session');
const io = require("socket.io")(server);

// Server all the static files from www folder
app.use(express.static(path.join(__dirname, "www")));
app.use(express.static(path.join(__dirname, "icons")));
app.use(express.static(path.join(__dirname, "node_modules/vue/dist/")));


app.set('view engine', 'html');
nunjucks.configure('www', {
    express: app,
})

app.use(session({
        secret: 'ras',
        resave: true,
        secure: false,
        saveUninitialized: false,
    })) //세션을 설정할 때 쿠키가 생성된다.&&req session의 값도 생성해준다. 어느 라우터든 req session값이 존재하게 된다.

const kakao = {
        clientID: '51e4976c7ef7df823c92663cdaef6fbc',
        clientSecret: 'pSgJYbhkgNFdAkZZ0R2jfM4QxBUS7XQQ',
        redirectUri: 'http://localhost:3000/auth/kakao/callback'
    }
    //profile account_email
app.get('/auth/kakao', (req, res) => {
    const kakaoAuthURL = `https://kauth.kakao.com/oauth/authorize?client_id=${kakao.clientID}&redirect_uri=${kakao.redirectUri}&response_type=code&scope=profile_nickname,profile_image,account_email`;
    res.redirect(kakaoAuthURL);
})

app.get('/auth/kakao/callback', async(req, res) => {
    //axios>>promise object
    try { //access토큰을 받기 위한 코드
        token = await axios({ //token
            method: 'POST',
            url: 'https://kauth.kakao.com/oauth/token',
            headers: {
                'content-type': 'application/x-www-form-urlencoded'
            },
            data: qs.stringify({
                    grant_type: 'authorization_code', //특정 스트링
                    client_id: kakao.clientID,
                    client_secret: kakao.clientSecret,
                    redirectUri: kakao.redirectUri,
                    code: req.query.code, //결과값을 반환했다. 안됐다.
                }) //객체를 string 으로 변환
        })
    } catch (err) {
        res.json(err.data);
    }
    //access토큰을 받아서 사용자 정보를 알기 위해 쓰는 코드
    let user;
    try {
        console.log(token); //access정보를 가지고 또 요청해야 정보를 가져올 수 있음.
        user = await axios({
            method: 'get',
            url: 'https://kapi.kakao.com/v2/user/me',
            headers: {
                Authorization: `Bearer ${token.data.access_token}`
            } //헤더에 내용을 보고 보내주겠다.
        })
    } catch (e) {
        res.json(e.data);
    }
    console.log(user);

    req.session.kakao = user.data;
    //req.session = {['kakao'] : user.data};
    res.redirect('../../');
})


app.get('/auth/profile', (req, res) => {
    if (req.session.kakao) {
        let { nickname } = req.session.kakao.properties;
        let { email } = req.session.kakao.kakao_account;
        res.send({ 'nickname': nickname, 'email': email });

    } else {
        res.send('unlogin');
    }

});


app.get('/login', (req, res) => {
    res.render('auth/index');
});

app.get(kakao.redirectUri)



// Get PORT from env variable else assign 3000 for development
const PORT = process.env.PORT || 3000;
server.listen(PORT, null, () => console.log("Listening on port " + PORT));

app.get("/legal", (req, res) => res.sendFile(path.join(__dirname, "www/legal.html")));

// All URL patterns should served with the same file.
app.get(["/", "/:room"], (req, res) => {
    res.sendFile(path.join(__dirname, "www/room.html"));
});

const channels = {};
const sockets = {};

io.sockets.on("connection", (socket) => {
    const socketHostName = socket.handshake.headers.host.split(":")[0];

    socket.channels = {};
    sockets[socket.id] = socket;

    console.log("[" + socket.id + "] connection accepted");
    socket.on("disconnect", () => {
        for (const channel in socket.channels) {
            part(channel);
        }
        console.log("[" + socket.id + "] disconnected");
        delete sockets[socket.id];
    });

    socket.on("join", (config) => {
        console.log("[" + socket.id + "] join ", config);
        const channel = socketHostName + config.channel;

        // Already Joined
        if (channel in socket.channels) return;

        if (!(channel in channels)) {
            channels[channel] = {};
        }

        for (const id in channels[channel]) {
            channels[channel][id].emit("addPeer", { peer_id: socket.id, should_create_offer: false });
            socket.emit("addPeer", { peer_id: id, should_create_offer: true });
        }

        channels[channel][socket.id] = socket;
        socket.channels[channel] = channel;
    });

    const part = (channel) => {
        // Socket not in channel
        if (!(channel in socket.channels)) return;

        delete socket.channels[channel];
        delete channels[channel][socket.id];

        for (const id in channels[channel]) {
            channels[channel][id].emit("removePeer", { peer_id: socket.id });
            socket.emit("removePeer", { peer_id: id });
        }
    };

    socket.on("relayICECandidate", (config) => {
        let peer_id = config.peer_id;
        let ice_candidate = config.ice_candidate;
        console.log("[" + socket.id + "] relay ICE-candidate to [" + peer_id + "] ", ice_candidate);

        if (peer_id in sockets) {
            sockets[peer_id].emit("iceCandidate", { peer_id: socket.id, ice_candidate: ice_candidate });
        }
    });

    socket.on("relaySessionDescription", (config) => {
        let peer_id = config.peer_id;
        let session_description = config.session_description;
        console.log("[" + socket.id + "] relay SessionDescription to [" + peer_id + "] ", session_description);

        if (peer_id in sockets) {
            sockets[peer_id].emit("sessionDescription", {
                peer_id: socket.id,
                session_description: session_description,
            });
        }
    });
});