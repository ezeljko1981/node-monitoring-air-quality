'use strict';
const simpleOauthModule = require('simple-oauth2');
const express = require('express');
const Wreck = require('@hapi/wreck');
const router = express.Router();
const config = require('./config.json');

let accessToken;

const callbackUrl = config.redirectUri;
const oauth2 = simpleOauthModule.create({
    client: {
        id: config.clientId,
        secret: config.clientSecret,
    },
    auth: {
        tokenHost: 'https://accounts.airthings.com',
        tokenPath: 'https://accounts-api.airthings.com/v1/token'
    },
});

// Authorization uri definition
const authorizationUri = oauth2.authorizationCode.authorizeURL({
    redirect_uri: callbackUrl,
    scope: 'read:device:current_values',
});

// Initial page redirecting to Airthings
const tokenConfig = {
    scope: 'read:device:current_values',
};

router.get('/auth', async (req, res) => {	
    try {
		const result = await oauth2.clientCredentials.getToken(tokenConfig);
        accessToken = oauth2.accessToken.create(result);
        res.redirect('/');
    } catch (error) {
        console.error('Access Token Error', error.message);
        return res.status(500).json('Authentication failed auth');
    }
});

// Callback service parsing the authorization token and asking for the access token
router.get('/callback', async (req, res) => {
    const code = req.query.code;
    const options = {
        code,
        redirect_uri: callbackUrl,
    };

    try {
        const result  = await oauth2.authorizationCode.getToken(options);
        accessToken = oauth2.accessToken.create(result);
        res.redirect('/');
    } catch (error) {
        console.error('Access Token Error', error.message);
        return res.status(500).json('Authentication failed cb');
    }
});

// Login route redirects to main page if access token exists
router.get('/login', (req, res) => {
    if (accessToken) {
        return res.redirect('/index');
    }
    res.render('login');
});

router.get('/logout', (req, res) => {
    accessToken = null;
    res.render('login');
});

// Main route redirects to login if no access token is present.
router.get('/', (req, res) => {
    if (!accessToken){
        return res.redirect('/login');
    }
    res.render('index', { data: null });
});

router.get('/devices/:id/latest-samples', async (req, res) => {
    const id = req.params['id'];
    return await getData(`devices/${id}/latest-samples`, res);
});

// Fetches data from Airthings ext-api
const getData = async (param, res) => {
    if (accessToken.expired()) {
        try {
            const params = {
                scope: 'read:device:current_values',
            };

            accessToken = await accessToken.refresh(params);
        } catch (error) {
            console.log("Error refreshing token: ", error.message);
        }
    }

    try {
        const options = {
            headers: {'Authorization': accessToken.token.access_token}
        };

        const { payload } = await Wreck.get(`https://ext-api.airthings.com/v1/${param}`, options);
        const payloadFormatted = JSON.stringify(JSON.parse(payload), null, 2);
        return res.render('index', { data: payloadFormatted });
    } catch (error) {
        console.error('Error fetching data', error.message);
        return res.status(500).json('Error fetching data');
    }
};

module.exports = router;
