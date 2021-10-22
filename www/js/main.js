var userid = '';
var useremail = '';
var username = '';
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
        }
    }
});

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

//메세지 저장
var messageRef = firebase.database().ref('users').orderByChild("studyTime").startAt(0);
messageRef.on('value', (snapshot) => {
    const data = snapshot.val();
    updateUserList(data, snapshot.numChildren());
});


//삭제(회원 탈퇴 구현 시 사용 예정)
function deleteall() {
    database.ref('users/' + id).remove();
}

function msToHMS(ms) {
    // 1- Convert to seconds:
    var seconds = ms / 1000;
    // 2- Extract hours:
    var hours = parseInt(seconds / 3600); // 3,600 seconds in 1 hour
    seconds = seconds % 3600; // seconds remaining after extracting hours
    // 3- Extract minutes:
    var minutes = parseInt(seconds / 60); // 60 seconds in 1 minute
    // 4- Keep only seconds not extracted to minutes:
    seconds = seconds % 60;
    if (hours == 0) {
        return (minutes + "분");
    } else { return (hours + "시간 " + minutes + "분"); }

}

function updateUserList(data, length) {
    var userlist = {};

    $('.userlist').html('');

    var cnt = 0;
    $.each(data, function(key, value) {
        userlist[cnt] = value;
        cnt++;
    });


    var foundValue = Object.values(userlist).filter(user => user.uid === userid);

    $('#today_stime').html(msToHMS(Number(foundValue[0].studyTime)));

    for (var i = 0; i < length; i++) {
        var today = todayDate.toString().substring(0, 10);
        if (userlist[i].lastStudy.toString().indexOf(today) != -1) {
            $('.userlist').append('<div class="user-item"><img src="https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png" class="rank_img"><h4 class="rank_name">' + userlist[i].nickname + '</h4> <h4><span class="time_text rank_time">' + msToHMS(Number(userlist[i].studyTime)) + '</span></h4> </div>');
        } else {
            $('.userlist').append('<div class="user-item"><img src="https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png" class="rank_img"><h4 class="rank_name">' + userlist[i].nickname + '</h4> <h4><span class="time_text rank_time">-</span></h4> </div>');

        }
    }

}