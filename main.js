let APP_ID = "db345c950afa451f88d64c6d99d70ff3";

let token = null;
let uid = String(Math.floor(Math.random() * 10000));
let screenSharing = false;
let client;
let channel;
let MemberId; // Define MemberId in the broader scope

let queryString = window.location.search;
let urlParams = new URLSearchParams(queryString);
let roomId = urlParams.get('room');

if (!roomId) {
    window.location = 'lobby.html';
}

let localStream;
let remoteStream;

let peerConnection;

const servers = {
    iceServers: [{
        urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302']
    }]
};

let constraints = {
    video: {
        width: { min: 640, ideal: 1920, max: 1920 },
        height: { min: 480, ideal: 1080, max: 1080 },
    },
    audio: true
};

let init = async () => {
    client = await AgoraRTM.createInstance(APP_ID);
    await client.login({ uid, token });

    channel = client.createChannel(roomId);
    await channel.join();

    channel.on('MemberJoined', handleUserJoined);
    channel.on('MemberLeft', handleUserLeft);

    client.on('MessageFromPeer', handleMessageFromPeer);

    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    document.getElementById('user-1').srcObject = localStream;

    document.getElementById('screen-share-btn').addEventListener('click', toggleScreenShare);

    // Set MemberId here
    MemberId = uid;

    // Send message to all members who have joined the channel
    document.getElementById('send-btn').addEventListener('click', () => sendMessage(MemberId));
};


let handleUserLeft = (MemberId) => {
    document.getElementById('user-2').style.display = 'none'
    document.getElementById('user-1').classList.remove('smallFrame')
}

let handleMessageFromPeer = async (message, MemberId) => {
    // console.log('Received message from peer:', message.text); // Log received message
    message = JSON.parse(message.text)

    if (message.type === 'message') {
        console.log('Received message:', message.message);
        // Display message in alert with Copy button
        let confirmation = confirm(`Message from peer : ${message.message}\n\nClick OK to copy the message to clipboard.`);
        if (confirmation) {
            // Copy message to clipboard
            navigator.clipboard.writeText(message.message)
                .then(() => {
                    alert('Message copied to clipboard!');
                })
                .catch(err => {
                    console.error('Error copying to clipboard:', err);
                });
        }
    }
    if(message.type === 'offer'){
        createAnswer(MemberId, message.offer)
    }

    if(message.type === 'answer'){
        addAnswer(message.answer)
    }

    if(message.type === 'candidate'){
        if(peerConnection){
            peerConnection.addIceCandidate(message.candidate)
        }
    }
}

let handleUserJoined = async (memberId) => {
    MemberId = memberId; // Set the MemberId when a user joins the channel
    console.log('A new user joined the channel:', memberId);
    createOffer(memberId);
};



let createPeerConnection = async (MemberId) => {
    peerConnection = new RTCPeerConnection(servers);

    remoteStream = new MediaStream();
    document.getElementById('user-2').srcObject = remoteStream;
    document.getElementById('user-2').style.display = 'block';
    document.getElementById('user-1').classList.add('smallFrame');

    if (!localStream) {
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        document.getElementById('user-1').srcObject = localStream;
    }

    localStream.getTracks().forEach((track) => {
        if (track.kind === 'audio') {
            // Exclude audio track for local user to avoid echo
            return;
        }
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => {
            remoteStream.addTrack(track);
        });
    };

    peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
            client.sendMessageToPeer({ text: JSON.stringify({ 'type': 'candidate', 'candidate': event.candidate }) }, MemberId);
        }
    };
};

let sendMessage = async (memberId) => {
    let message = window.prompt('Enter your message:');
    if (message !== null && message.trim() !== '') {
        console.log('Sending message:', message);
        client.sendMessageToPeer({ text: JSON.stringify({ 'type': 'message', 'message': message }) }, memberId);
    } else {
        alert('Please enter a non-empty message.');
    }
};

let createOffer = async (MemberId) => {
    await createPeerConnection(MemberId)

    let offer = await peerConnection.createOffer()
    await peerConnection.setLocalDescription(offer)

    client.sendMessageToPeer({text:JSON.stringify({'type':'offer', 'offer':offer})}, MemberId)
    
}


let createAnswer = async (MemberId, offer) => {
    await createPeerConnection(MemberId)

    await peerConnection.setRemoteDescription(offer)

    let answer = await peerConnection.createAnswer()
    await peerConnection.setLocalDescription(answer)

    client.sendMessageToPeer({text:JSON.stringify({'type':'answer', 'answer':answer})}, MemberId)
}


let addAnswer = async (answer) => {
    if(!peerConnection.currentRemoteDescription){
        peerConnection.setRemoteDescription(answer)
    }
}


let leaveChannel = async () => {
    await channel.leave()
    await client.logout()
}

let toggleCamera = async () => {
    let videoTrack = localStream.getTracks().find(track => track.kind === 'video')

    if(videoTrack.enabled){
        videoTrack.enabled = false
        document.getElementById('camera-btn').style.backgroundColor = 'rgb(255, 80, 80)'
    }else{
        videoTrack.enabled = true
        document.getElementById('camera-btn').style.backgroundColor = 'rgb(179, 102, 249, .9)'
    }
}

let toggleMic = async () => {
    let audioTrack = localStream.getTracks().find(track => track.kind === 'audio')

    if(audioTrack.enabled){
        audioTrack.enabled = false
        document.getElementById('mic-btn').style.backgroundColor = 'rgb(255, 80, 80)'
    }else{
        audioTrack.enabled = true
        document.getElementById('mic-btn').style.backgroundColor = 'rgb(179, 102, 249, .9)'
    }
}
let toggleScreenShare = async () => {
    try {
        if (!screenSharing) {
            screenSharing = true;
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true , audio:true});
            const videoTrack = screenStream.getVideoTracks()[0];
            const audioTrack = localStream.getAudioTracks()[0];
            localStream.removeTrack(localStream.getVideoTracks()[0]);
            localStream.addTrack(videoTrack);
            peerConnection.getSenders().forEach(sender => {
                if (sender.track.kind === 'video') {
                    sender.replaceTrack(videoTrack);
                }
            });
            screenStream.getVideoTracks()[0].addEventListener('ended', () => {
                toggleScreenShare(); // Toggle back to local view when screen sharing ends
            });
        } else {
            await stopScreenSharing(); // Call the function to stop screen sharing
        }
    } catch (error) {
        console.error('Error accessing screen sharing:', error);
    }
};
let stopScreenSharing = async () => {
    try {
        screenSharing = false;
        const videoTrack = localStream.getVideoTracks()[0];
        const newStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        const newVideoTrack = newStream.getVideoTracks()[0];
        localStream.removeTrack(videoTrack);
        localStream.addTrack(newVideoTrack);
        peerConnection.getSenders().forEach(sender => {
            if (sender.track.kind === 'video') {
                sender.replaceTrack(newVideoTrack);
            }
        });

        // Leave the channel
        await leaveChannel();

        // Redirect to lobby
        window.location = 'lobby.html';
    } catch (error) {
        console.error('Error stopping screen sharing:', error);
    }
};




window.addEventListener('beforeunload', leaveChannel)


document.getElementById('camera-btn').addEventListener('click', toggleCamera)
document.getElementById('mic-btn').addEventListener('click', toggleMic)
document.getElementById('leave-btn').addEventListener('click', stopScreenSharing)


document.addEventListener('DOMContentLoaded', function() {
    document.addEventListener('click', function(event) {
        event.preventDefault();
    });
});

init()