const fs = require('fs');
const express = require('express');
const readline = require('readline');
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];
const TOKEN_PATH = 'token.json';
const PORT = 3000;

const credentials = require('./credentials.json');
const app = express();

function getAccessToken(authCode, callback) {
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]
    );
  
    oAuth2Client.getToken(authCode, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  }
  

function authorize(credentials, callback) {
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, `http://localhost:${PORT}/oauth2callback`
    );
    console.log('After authorization');
    
    fs.readFile(TOKEN_PATH, (err, token) => {
        if (err) {
          return getAuthorizationUrl(oAuth2Client, callback);
        }
        oAuth2Client.setCredentials(JSON.parse(token));
        callback(oAuth2Client);
      });
}

function getAuthorizationUrl(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log(`Authorize this app by visiting this url: ${authUrl}`);
  callback();
}

function checkForNewEmails(auth) {
    const gmail = google.gmail({ version: 'v1', auth });
    gmail.users.messages.list({
      userId: 'me',
      q: 'is:inbox is:unread',
    }, (err, res) => {
      if (err) return console.error('The API returned an error:', err);
  
      const messages = res.data.messages;
      if (messages && messages.length > 0) {
        messages.forEach((message) => {
          processEmail(auth, message.id);
        });
      } else {
        console.log('No new emails found.');
      }
    });
  }
  
  // Function to process an email
  function processEmail(auth, messageId) {
    const gmail = google.gmail({ version: 'v1', auth });
  
    gmail.users.messages.get({
      userId: 'me',
      id: messageId,
    }, (err, res) => {
      if (err) return console.error('Error fetching email:', err);
  
      const email = res.data;
      const threadId = email.threadId;
  
      // Check if any previous emails have been sent in this thread
      if (!email.payload.headers.some(header => header.name === 'From' && header.value.includes('mansipandit2024@gmail.com'))) {
        // Send a reply
        sendReply(auth, threadId);
  
        // Add a label and move the email to the label
        addLabel(auth, messageId, 'Vacation Replies');
      }
    });
  }
  
  // Function to send a reply
  function sendReply(auth, threadId) {
    const gmail = google.gmail({ version: 'v1', auth });
  
    const raw = 'To: ' + 'recipient@example.com' + '\r\n' +
      'Subject: Re: Vacation Reply\r\n' +
      '\r\n' +
      'Thank you for your email! I am currently on vacation and will respond to your message as soon as possible.\r\n';
  
    gmail.users.messages.send({
      userId: 'me',
      resource: {
        raw: Buffer.from(raw).toString('base64'),
        threadId: threadId,
      },
    }, (err, res) => {
      if (err) return console.error('Error sending reply:', err);
  
      console.log('Reply sent successfully.');
    });
  }
  
  // Function to add label and move the email
  function addLabel(auth, messageId, labelName) {
    const gmail = google.gmail({ version: 'v1', auth });
  
    // Check if the label exists, if not, create it
    gmail.users.labels.list({
      userId: 'me',
    }, (err, res) => {
      if (err) return console.error('Error fetching labels:', err);
  
      const labels = res.data.labels;
      const label = labels.find(label => label.name === labelName);
  
      if (!label) {
        gmail.users.labels.create({
          userId: 'me',
          resource: {
            name: labelName,
            labelListVisibility: 'labelShow',
            messageListVisibility: 'show',
          },
        }, (err, res) => {
          if (err) return console.error('Error creating label:', err);
  
          console.log('Label created successfully.');
          moveEmailToLabel(gmail, messageId, res.data.id);
        });
      } else {
        moveEmailToLabel(gmail, messageId, label.id);
      }
    });
  }
  
  // Function to move the email to a label
  function moveEmailToLabel(gmail, messageId, labelId) {
    gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      resource: {
        addLabelIds: [labelId],
        removeLabelIds: ['INBOX'],
      },
    }, (err, res) => {
      if (err) return console.error('Error moving email to label:', err);
  
      console.log('Email moved to label successfully.');
    });
  }
  
  // Function to run the entire process at random intervals
  function runProcess() {
    authorize(credentials, (auth) => {
      checkForNewEmails(auth);
  
      // Schedule the process to run again in a random interval between 45 and 120 seconds
      const randomInterval = Math.floor(Math.random() * (120 - 45 + 1) + 45) * 1000;
      setTimeout(runProcess, randomInterval);
    });
  }
  
app.get('/oauth2callback', (req, res) => {
    const authCode = req.query.code;
    if (authCode) {
      getAccessToken(authCode, (auth) => {
        checkForNewEmails(auth);
        res.send('Authorization successful. You can close this window now.');
      });
    } else {
      res.send('Authorization failed. Please try again.');
    }
  });


app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  authorize(credentials, () => {});
});

runProcess();
// {
//     "installed": {
//       "client_id": "YOUR_CLIENT_ID",
//       "project_id": "YOUR_PROJECT_ID",
//       "auth_uri": "https://accounts.google.com/o/oauth2/auth",
//       "token_uri": "https://accounts.google.com/o/oauth2/token",
//       "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
//       "client_secret": "YOUR_CLIENT_SECRET",
//       "redirect_uris": ["urn:ietf:wg:oauth:2.0:oob", "http://localhost"]
//     }
//   }