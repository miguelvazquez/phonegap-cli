/*
command: phonegap analytics

when: user has opted in
result: outputs message "Analytics is enabled! Nice, you are helping us make phonegap tooling better."
"If you would like to turn analytics off, simply run `phonegap analytics off`

when: user has opted out
result: outputs message "Analytics is off. If you would like to enable analytics simply run `phonegap analytics on`"

when: user has not specified anything yet
result: user is presented with y/n option to explicitely turn it on or off

commands:
phonegap analytics reset|on|off
*/

var Insight = require('insight');
var fs = require('fs');
var path = require('path');
var request = require('request');
var uuid = require('node-uuid');

// Google Analytics tracking code
var trackingCode = 'UA-94271-37'; // this is the default production tracking code

var rootPath = require.resolve('../../package.json');
var gitPath = path.join(path.dirname(rootPath),'.git');
if(fs.existsSync(gitPath)) {
    // set it to the dev tracking code
    trackingCode = 'UA-94271-38';
}

var insight = new Insight({
    "trackingCode": trackingCode,
    "pkg": require('../../package.json')
});

var category = 'phonegap@' + require('../../package.json').version;
var sessionID = uuid.v1();

var PromptPreamble = '\nHow you use PhoneGap provides us with important data that we can use to make\n' +
                     'our products better. Please read our privacy policy for more information on the\n' +
                     'data we collect. http://www.adobe.com/privacy.html';
var PromptMessage = 'Would you like to allow PhoneGap to collect anonymous usage data?';
var UserAcceptedMessage = '\nThank you for helping to make PhoneGap better.\n';
var UserDeclinedMessage = '\nYou have opted out of analytics. To change this, run: `phonegap analytics on`\n';
var AnalyticsOffMessage  = '\nAnalytics is off. \nIf you would like to turn analytics on, simply run `phonegap analytics on`\n';
var AnalyticsOnMessage  = '\nAnalytics is on! Nice, you are helping us improve PhoneGap tooling.\n' +
                         'If you would like to turn analytics off, simply run `phonegap analytics off`\n';

/*
    Helper function to determine if cli is a production/dev release
*/

function getDebugFlag() {
    if(/cordova/.test(category)) {
        return true
    } else {
        return false;
    }
}

/*
    Helper function to help build up GELF formatted json
*/

function basicGELF() {
    return {
        "version": "1.1",
        "host": "cli",
        "short_message": "",
        "_userID": sessionID,
        "_platform": process.platform,
        "_appVersion": category,
        "_env": getDebugFlag() ? 1 : 0
    };
}

/*
    Helper function to send events to the analytics end point
*/
function sendAnalytics(data) {
    if (!data) return;

    request.post({
        url: 'https://metrics.phonegap.com/gelf',
        form: JSON.stringify(data)
    }, function(err, res, body) {
        if (err) {
            console.log('*** post error: ' + err);
        } else {
            console.log('*** post success: ' + body);
        }
    });
}

module.exports = function analytics(argv, callback) {
    var params = argv._.slice(1);

    if (params.length > 0) {
        switch(params[0]) {
            case "on" :
                // only track it if the value is changing
                if (insight.optOut !== false) {
                    // must change it before we use it
                    insight.optOut = false;
                    insight.trackEvent({"category":category,
                                        "action":"set analytics",
                                        "label":"opt in"});

                    var info = basicGELF();
                    info.short_message = "set analytics opt in";
                    sendAnalytics(info);
                }
                break;
            case "off" :
                // track it only if it changes
                if (insight.optOut !== true) {
                    // must use it before we change it
                    insight.trackEvent({"category":category,
                                        "action":"set analytics",
                                        "label":"opt out"});

                    var info = basicGELF();
                    info.short_message = "set analytics opt out";
                    sendAnalytics(info);

                    insight.optOut = true;
                }
                break;
            case "reset" :
                // this is a secret api, mainly just for testing the prompt messages
                console.log("resetting it .. ");
                insight.optOut = undefined;
                // intentional fallthrough!
            default:
                // unrecognized param
                insight.trackEvent({"category":category,
                                    "action":"set analytics",
                                    "label":"unrecognized param"});

                var info = basicGELF();
                info.short_message = "set analytics unrecognized param";
                sendAnalytics(info);

                break;
        }
    }

    if (insight.optOut === undefined) {

    }
    else {
        // somewhat confusing tri-state, it could be true|false|undefined
        if (insight.optOut) {
            console.log(AnalyticsOffMessage);
        }
        else {
            console.log(AnalyticsOnMessage);
        }
    }
    callback();
};


module.exports.prompt = function prompt(callback) {
    console.log(PromptPreamble);

    insight.askPermission(PromptMessage,function(error,optIn) {
        if (optIn) {
            // user has accepted, we will thank them and track this
            insight.trackEvent({"category":"analytics-prompt",
                                "action":"accepted",
                                "label":""});

            var info = basicGELF();
            info.short_message = "analytics-prompt accepted";
            sendAnalytics(info);

            console.log(AnalyticsOnMessage);
        }
        else {
            // user has declined, we still want to track this
            insight.optOut = false;
            insight.trackEvent({"category":"analytics-prompt",
                                "action":"declined",
                                "label":""});

            var info = basicGELF();
            info.short_message = "analytics-prompt declined";
            sendAnalytics(info);

            insight.optOut = true;
            console.log(AnalyticsOffMessage);
        }
        callback();
    });
};

module.exports.statusUnknown = function statusUnknown() {
    return insight.optOut === undefined;
};

module.exports.track = function track() {
    if (insight.optOut === false) {
        var args = Array.prototype.slice.call(arguments);
        insight.track.apply(insight, args);
    }
};

module.exports.trackEvent = function trackEvent(category,action,label,value) {
    if (insight.optOut === false) {
        category = category || "-";
        action = action || "-";
        label = label || "-";
        value = value || 0;
        insight.trackEvent({"category":category,
                            "action":action,
                            "label":label,
                            "value":value});

        var info = basicGELF();
        info.short_message = category;
        info.action = action;
        info.label = label;
        info.value = value;

        sendAnalytics(info);
    }
};
