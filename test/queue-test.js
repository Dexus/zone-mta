'use strict';

const levelup = require('levelup');
const path = require('path');
const dbfolder = path.join(__dirname, 'queuetest');
const MailQueue = require('../lib/mail-queue');
const PassThrough = require('stream').PassThrough;
const memdown = require('memdown');

let db;
let queue;

// run before each test
module.exports.setUp = done => {
    db = levelup(dbfolder, {
        db: memdown
    });
    db.on('ready', () => {
        queue = new MailQueue({
            dbinstance: db
        });
        queue.init(done);
    });
};

// run before each test
module.exports.tearDown = done => {
    queue.stopPeriodicCheck();
    queue = null;
    setImmediate(() => {
        db.close(() => {
            db = null;
            done();
        });
    });
};

module.exports['Check if DB is open'] = test => {
    test.ok(db.isOpen());
    setImmediate(() => test.done());
};

module.exports['Push and shift a bunch of messages to and from queue'] = test => {
    let maxmessages = 1000;
    let inserted = 0;

    let shiftNext = () => {
        queue.shift('default', false, (err, delivery) => {
            test.ifError(err);
            if (!delivery) {
                return test.done();
            }

            let msg = queue.retrieve(delivery.id);
            msg.on('data', () => false);
            msg.on('end', () => {
                queue.releaseDelivery(delivery, err => {
                    test.ifError(err);
                    setImmediate(shiftNext);
                });

            });
        });
    };

    let insertNext = () => {

        let envelope = {
            interface: 'test',
            from: 'sender@example.com',
            to: ['receiver@example.com', 'receiver@blurdybloop.com'],
            origin: '1.2.3.4',
            headers: {}
        };

        let message = new PassThrough();
        setImmediate(() => message.end(new Buffer(1024 * 10)));

        queue.store(false, message, (err, id) => {
            test.ifError(err);

            queue.push(id, envelope, err => {
                test.ifError(err);
                if (++inserted < maxmessages) {
                    insertNext();
                } else {
                    return shiftNext();
                }
            });
        });
    };

    insertNext();
};
