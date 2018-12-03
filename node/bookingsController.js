// Model Objects
var tutorObj = require('../models/users/tutor.js');
var subjectObj = require('../models/subjects.js');
var locationObj = require('../models/locations.js');
var wizardObj = require('../models/wizards.js');
var bookingObj = require('../models/bookings.js');
var studentTestObj = require('../models/studenttestandresults.js');
var learnerObj = require('../models/users/learner.js');
var scheduleObj = require('../models/schedules.js');
var adminPolicyObj = require('../models/adminpolicies.js');
var reschedulelessionlogObj = require('../models/reschedulelessionlog.js');
var paymentlogObj = require('../models/paymentlog.js');
var walletObj = require('../models/wallets.js');
var notificationsObj = require('../models/notifications.js');
var pushNoti = require('../push_notifications.js');
var socketObj = require('../socket.js');

// External libraries
var _ = require('lodash');
var moment = require('moment');
var async = require('async');
var crypto = require('crypto');
var biguint = require('biguint-format');
// contants and variables
var constantObj = require('../../config/constants.js');
var outputJSON = {};
// Mongoose Object
var ObjectId = require('mongoose').Types.ObjectId;
// Services for Email & Other Activities
var emailServiceObj = require('../email_services.js');
var activityObj = require('../activity_services.js');

// functions
module.exports = {
    getMyStudentsList: getMyStudentsList,
    saveBookLessonInfo: saveBookLessonInfo,
    getMyTeachersList: getMyTeachersList,
    getFactSheetBasedOnBookingId: getFactSheetBasedOnBookingId,
    getProgressBasedOnBookingId: getProgressBasedOnBookingId,
    getStudentList: getStudentList,
    updateBookingInfo: updateBookingInfo,
    getBackPackSubjects: getBackPackSubjects,
    updateInClassMaterial: updateInClassMaterial,
    getTutorList: getTutorList,
    getToBookLessonDetails: getToBookLessonDetails,
    getTutorBusinessHours: getTutorBusinessHours,
    saveTutorBusinessHours: saveTutorBusinessHours,
    getTutorNonAvailability: getTutorNonAvailability,
    editTutorScheduleEvent: editTutorScheduleEvent,
    editBusinessHours: editBusinessHours,
    createTutorExceptionEvent: createTutorExceptionEvent,
    getLearnerNonAvailability: getLearnerNonAvailability,
    editLearnerScheduleEvent: editLearnerScheduleEvent,
    getLearnerSubjectsList: getLearnerSubjectsList,
    saveTutorFeedback: saveTutorFeedback,
    getUpcomingEvents: getUpcomingEvents,
    getTutorPolicies: getTutorPolicies,
    requestForRescheduleAtLearner: requestForRescheduleAtLearner,
    requestForRescheduleAtTutor: requestForRescheduleAtTutor,
    updateInterview: updateInterview,
    updateBookingPayment: updateBookingPayment,
    getBookingInfo: getBookingInfo,
    getOverduesLessons: getOverduesLessons,
    getAppUpcomingEvents: getAppUpcomingEvents,
    getAppCompletedEvents: getAppCompletedEvents,
    getBackPackActivities: getBackPackActivities,
    cancelLearnerScheduleEvent: cancelLearnerScheduleEvent,
    cancelTutorScheduleEvent: cancelTutorScheduleEvent,
    saveInterviewInfo: saveInterviewInfo,
    saveOnlyBooking: saveOnlyBooking,
    updateException: updateException,
    getExceptionList : getExceptionList,
    deleteException : deleteException
};

/*
 * @created         28/10/2016
 * @author          Amanpreet Singh
 * @method          getMyStudents
 * @description     get all students list of tutor based on booking type
 * @copyright       smartData
 */



function getMyStudentsList(req, res) {
    var id = req.params.id;

    var fields = {};
    var conditions = {
        tutor_id: req.params.id
    };
    var sorting = {
        createdDate: -1
    };

    bookingObj.find(conditions, fields)
            .populate([
                {path: 'student_id', select: 'email personalInfo'},
                {path: 'subject_id'},
                {path: 'level_id'},
                {path: 'tutor_id', select: 'email personalInfo'}
            ])
            .sort(sorting)
            .exec(function (err, data) {
                if (err) {
                    res.jsonp({status: 201, msg: err});
                } else {
                    res.jsonp({status: 200, msg: "get all data.", data: data});
                }
            });
}
/*
 * @created     09/08/2018
 * @author      Malik KHan
 * @desc        Update Tutor exception
 * @copyright   smartData
 */
function updateException(req, res) {
    var updateFields = {
        "isDeleted": true,
    };
    var conditions = {
        _id: ObjectId(req.body.event.eventId),
    };
    scheduleObj.findOneAndUpdate(conditions, {$set: updateFields}, {new : false})
            .exec(function (err, data) {
                if (err) {
                    res.jsonp({status: 201, message: err});
                } else {
                    res.jsonp({status: 200, message: 'Record fetched successfully'});
                }
            });

}
/*
 * @created     21/10/2016
 * @author      Amanpreet Singh
 * @desc        save booking lesson information with & without interview including payment
 * @copyright   smartData
 */
function saveBookLessonInfo(req, res) {
    // Stripe Object

    var stripeCredentials = process.LaSec['stripe-credentials'];
    var stripe = require('stripe')(stripeCredentials.stripe_secret_key);

    var bookingData = req.body;
    var scheduleData = [];
    var afterbookingData = [];
    var paymentlogData = [];
    var afterpaymentData = [];
    var bookingtemplateData1 = []; // tutor
    var bookingtemplateData2 = []; // learner
    var walletData = {};
    var token = req.body.token;
    var stripe_data = {};
    var tutortemplate = {};
    var learnertemplate = {};
    var activity = {}; // For Activities
    var activitytemplate = {}; // For activity Template content
    var activity1 = {};
    var activitytemplate1 = {};
    var pushData = {}; // For push notifications
    var userObj = {}; // user object for push notifications
    var conditions = {
        "$or": [
            {"tutor_id": ObjectId(req.body.tutor_id)},
            {"student_id": ObjectId(req.body.student_id)}
        ],
        "start": {
            $gte: moment().startOf('day').toISOString()
        },
        "isDeleted": false,
        "enable": true
    };

    var checkEvent = [];

    var isInterview = req.body.is_interview_require;
    if (isInterview) {
        var interviewStart = moment(req.body.interviewschedule.interviewstart);
        var interviewEnd = moment(req.body.interviewschedule.interviewend);
        // create interview object for db insertion
        var interview = {
            "title": "Interview",
            "start": interviewStart,
            "end": interviewEnd,
            "allDay": false,
            "overlap": false,
            "subject_id": ObjectId(req.body.subject_id),
            "level_id": ObjectId(req.body.level_id),
            "tutor_id": ObjectId(req.body.tutor_id),
            "student_id": ObjectId(req.body.student_id),
            "color": "#3B3A32",
            "isDeleted": false,
            "enable": true,
            "type": "interview"
        };
        scheduleData.push(interview);
    }

    var paymentInfo = req.body.payment_info;
    var bookingInfo = req.body.booking_info;
    if (bookingInfo) {
        var index = 1;
        _.forEach(bookingInfo, function (v) {
            // Schedule Data
            scheduleData.push({
                "title": "Lesson",
                "start": v.start,
                "end": v.end,
                "allDay": false,
                "overlap": false,
                "subject_id": ObjectId(req.body.subject_id),
                "level_id": ObjectId(req.body.level_id),
                "tutor_id": ObjectId(req.body.tutor_id),
                "student_id": ObjectId(req.body.student_id),
                "color": "#3B3A32",
                "isDeleted": false,
                "enable": true,
                "type": "lesson",
                "lesson_duration": v.lesson_duration,
                "lesson_price": v.lesson_price
            });

            // Payment Log
            paymentlogData.push({
                "payment_status": 'pending',
                "payment_type": 'booking',
                "payment_desc": 'Lesson (#' + index + ')',
                "payment_to": {
                    role: 'tutors',
                    user: ObjectId(req.body.tutor_id)
                },
                "payment_from": {
                    role: 'learners',
                    user: ObjectId(req.body.student_id)
                },
                payment_amount: v.lesson_price,
                isAdminReceived: true
            });
            index++;
        });
        // Wallet Data
        walletData = {
            wallet_type: req.body.subject_type,
            wallet_desc: 'For booking of ' + req.body.no_of_lessons + ' lesson packages',
            wallet_user: {
                role: 'learners',
                user: ObjectId(req.body.student_id)
            },
            debit_amount: paymentInfo.totalbookingamount,
            wallet_status: 'paid'
        };
    }

    async.waterfall([
        function (callback) { // check tutor or learner interviews
            scheduleObj.find(conditions)
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            var events = data; //_.reject(data,{"_id":ObjectId(req.body._id) });

                            _.forEach(events, function (key) {
                                var startEvent = moment(key.start);
                                var endEvent = moment(key.end);
                                // checks if event does not conflict previous events        
                                if (Math.round(startEvent) / 1000 < Math.round(interviewEnd) / 1000 && Math.round(endEvent) > Math.round(interviewStart)) {
                                    checkEvent.push(true);
                                }
                            });
                            if (checkEvent.length > 0) {
                                err = 'Another Interview is scheduled for the time selected';
                                return callback(err);
                            } else {
                                callback(null, true);
                            }
                        }
                    });
        },
        function (noconflict, callback) { // check learner interviews
            scheduleObj.find(conditions)
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            var events = data;

                            _.forEach(events, function (key) {
                                var startEvent = moment(key.start);
                                var endEvent = moment(key.end);
                                // checks if event does not conflict previous events 
                                _.forEach(bookingInfo, function (bookevent) {

                                    var bookingStart = moment(bookevent.start);
                                    var bookingEnd = moment(bookevent.end);

                                    if (Math.round(startEvent) / 1000 < Math.round(bookingEnd) / 1000 &&
                                            Math.round(endEvent) > Math.round(bookingStart)) {
                                        checkEvent.push(true);
                                    }
                                });
                            });

                            if (checkEvent.length > 0) {
                                err = 'There is already a booking scheduled for the time selected';
                                return callback(err);
                            } else {
                                callback(null, true);
                            }
                        }
                    });
        },
        function (noconflict, callback) { // Create Stripe Charge for the Customer
            if (token && !isInterview) {
                var price = paymentInfo.totalbookingamount * 100; // converting the amount into cents
                stripe.customers.create({
                    email: token.email,
                    source: token.id
                }).then(function (customer) {
                    return stripe.charges.create({
                        amount: price,
                        currency: constantObj.stripeCredentials.currency,
                        customer: customer.id
                    });
                }).then(function (charge) {
                    stripe_data = {
                        charge_id: charge.id,
                        amount: charge.amount,
                        application_fee: charge.application_fee,
                        customer: charge.customer,
                        captured: charge.captured,
                        currency: charge.currency,
                        created: charge.created,
                        balance_transaction: charge.balance_transaction
                    };
                    return stripe.balance.retrieveTransaction(
                            charge.balance_transaction
                            );
                }).then(function (balance) {
                    stripe_data.description = balance.description;
                    stripe_data.available_on = balance.available_on;
                    stripe_data.fee_details = balance.fee_details;
                    stripe_data.net = balance.net;
                    callback(null, stripe_data);
                }).catch(function (err) {
                    console.log(err);
                    return callback(err);
                });
            } else {
                callback(null, {});
            }
        },
        function (stripe, callback) { // save tutor bookings
            crypto.randomBytes(5, function (err, buf) {
                var booking_ref = buf.toString('hex');
                bookingData = _.extend({}, bookingData, {booking_ref: booking_ref});
                if (!isInterview) {
                    bookingData = _.extend({}, bookingData, {stripe_details: stripe, current_booking_status: "Current"});
                }

                bookingObj(bookingData).save(function (err, data) {
                    if (err) {
                        return callback(err);
                    } else {
                        callback(null, data);
                    }
                });
            });

        },
        function (booking, callback) { // save the details into schedules collection
            var bookingId = booking._id;
            var lessonindex = 0;
            _.forEach(scheduleData, function (v, k) {
                // In case interview is there
                if (v.type === 'interview') {
                    v = _.extend({}, v, {booking_id: ObjectId(bookingId)});
                    afterbookingData.push(v);
                }
                // for booking slots only 
                if (v.type === 'lesson') {
                    var lesson = booking.booking_info[lessonindex];
                    v = _.extend({}, v, {booking_id: ObjectId(bookingId), lesson_id: ObjectId(lesson._id)});
                    afterbookingData.push(v);
                    lessonindex++;
                }
            });

            scheduleObj.create(afterbookingData, function (err) {
                if (err) {
                    return callback(err);
                } else {
                    callback(null, booking);
                }
            });
        },
        function (booking, callback) { // insert the record into payment log
            var bookingId = booking._id;
            if (!isInterview) {
                var lessonindex = 0;
                _.forEach(paymentlogData, function (v, k) {
                    // for booking slots only 
                    var lesson = booking.booking_info[lessonindex];
                    v = _.extend({}, v, {booking_id: ObjectId(bookingId), lesson_id: ObjectId(lesson._id)});
                    afterpaymentData.push(v);
                    lessonindex++;
                });

                paymentlogObj.create(afterpaymentData, function (err) {
                    if (err) {
                        return callback(err);
                    } else {
                        callback(null, booking);
                    }
                });
            } else {
                callback(null, booking);
            }

        },
        function (booking, callback) { // insert the record into wallet collection
            var bookingId = booking._id;
            var reference = booking.booking_ref;
            var receipt_no = biguint(crypto.randomBytes(4), 'dec', {groupsize: 5, delimiter: '-'});
            if (!isInterview) {
                walletData = _.extend({}, walletData, {
                    booking_id: ObjectId(bookingId),
                    reference_no: reference,
                    receipt_no: receipt_no
                });

                walletObj(walletData).save(function (err, data) {
                    if (err) {
                        return callback(err);
                    } else {
                        callback(null, bookingId);
                    }
                });
            } else {
                callback(null, bookingId);
            }
        },
        function (bookingId, callback) { // for email and other notifications
            bookingObj.findOne({"_id": bookingId})
                    .populate([
                        {path: 'tutor_id', select: 'personalInfo email currTimeOffset deviceId '},
                        {path: 'student_id', select: 'personalInfo email currTimeOffset deviceId '},
                        {path: 'subject_id', select: 'name'},
                        {path: 'package_id'}
                    ])
                    .lean()
                    .exec(function (err, data) {
                        if (err) {

                        } else {
                            // Learner & Tutor first and last name 
                            var l_fname = (data.student_id.personalInfo.firstName) ? (data.student_id.personalInfo.firstName) : 'Learner';
                            var l_lname = (data.student_id.personalInfo.lastName) ? (data.student_id.personalInfo.lastName) : '';
                            var t_fname = (data.tutor_id.personalInfo.firstName) ? (data.tutor_id.personalInfo.firstName) : 'Tutor';
                            var t_lname = (data.tutor_id.personalInfo.lastName) ? (data.tutor_id.personalInfo.lastName) : '';

                            var l_offset = (data.student_id.currTimeOffset) ? data.student_id.currTimeOffset : '+0000';
                            var t_offset = (data.tutor_id.currTimeOffset) ? data.tutor_id.currTimeOffset : '+0000';



                            //push notification in case of successful booking
                            if (data.tutor_id && data.tutor_id.deviceId) {
                                var jsonobj = {noti_section: 'lesson_notification', noti_data: {}};
                                if (isInterview) {
                                    pushData = {
                                        title: 'Video Interview',
                                        body: l_fname + ' ' + l_lname + ' has booked an Interview for ' + data.subject_id.name,
                                        jsonobj: jsonobj
                                    };
                                } else {
                                    pushData = {
                                        title: 'Lesson Booking',
                                        body: l_fname + ' ' + l_lname + ' has booked you for ' + data.subject_id.name + ' with #' + req.body.no_of_lessons + ' lessons',
                                        jsonobj: jsonobj
                                    };
                                }

                                userObj = {
                                    senderId: '',
                                    senderType: '',
                                    receiverId: data.tutor_id._id,
                                    receiverType: 'tutors'
                                };
                                pushNoti.sendPushNotificationByUserId(userObj, pushData);
                            }

                            // Email, Recent Activity & App Notification
                            if (isInterview) {

                                tutortemplate = {
                                    emailTo: data.tutor_id.email,
                                    emailToName: t_fname,
                                    learnername: l_fname + ' ' + l_lname,
                                    interviewtime: moment(interviewStart).utcOffset(t_offset).format("dddd, MMMM Do YYYY, h:mm:ss a")
                                };

                                learnertemplate = {
                                    emailTo: data.student_id.email,
                                    emailToName: l_fname,
                                    tutorname: t_fname + ' ' + t_lname,
                                    interviewtime: moment(interviewStart).utcOffset(l_offset).format("dddd, MMMM Do YYYY, h:mm:ss a")
                                };

                                activity = {slug: 'learner-video-interview-request', user_id: data.student_id._id, role: 'learners'};
                                activitytemplate = {
                                    TNAME: t_fname + ' ' + t_lname,
                                    SUBJECTNAME: data.subject_id.name
                                };

                                activity1 = {slug: 'tutor-video-interview-request', user_id: data.tutor_id._id, role: 'tutors'};
                                activitytemplate1 = {
                                    LNAME: l_fname + ' ' + l_lname,
                                    SUBJECTNAME: data.subject_id.name
                                };

                                emailServiceObj.callInterviewRequestMail(tutortemplate, 'tutor');
                                emailServiceObj.callInterviewRequestMail(learnertemplate, 'learner');
                                activityObj.triggerActivity(activity, activitytemplate);
                                activityObj.triggerActivity(activity1, activitytemplate1);
                            } else {
                                index = 1;
                                _.forEach(bookingInfo, function (v) {
                                    bookingtemplateData1.push({
                                        "lessonname": "Lesson " + index,
                                        "duration": v.lesson_duration + "hr",
                                        "lessontime": moment(v.start).utcOffset(t_offset).format("DD/MM/YYYY hh:mm A"),
                                        "price": "$" + v.lesson_price,
                                        "subtotal": "$" + v.lesson_price
                                    });

                                    bookingtemplateData2.push({
                                        "lessonname": "Lesson " + index,
                                        "duration": v.lesson_duration + "hr",
                                        "lessontime": moment(v.start).utcOffset(l_offset).format("DD/MM/YYYY hh:mm A"),
                                        "price": "$" + v.lesson_price,
                                        "subtotal": "$" + v.lesson_price
                                    });
                                    index++;
                                });

                                tutortemplate = {
                                    emailTo: data.tutor_id.email,
                                    emailToName: t_fname,
                                    learnername: l_fname + ' ' + l_lname,
                                    tutorname: t_fname + ' ' + t_lname,
                                    subject_name: data.subject_id.name,
                                    packagename: data.package_id.number_lesson + ' lesson package -' + data.package_id.name,
                                    ref_no: data.booking_ref,
                                    totalpayment: "$" + paymentInfo.totalbookingamount,
                                    lessonarr: bookingtemplateData1
                                };

                                learnertemplate = {
                                    emailTo: data.student_id.email,
                                    emailToName: l_fname,
                                    learnername: l_fname + ' ' + l_lname,
                                    tutorname: t_fname + ' ' + t_lname,
                                    subject_name: data.subject_id.name,
                                    packagename: data.package_id.number_lesson + ' lesson package -' + data.package_id.name,
                                    ref_no: data.booking_ref,
                                    totalpayment: "$" + paymentInfo.totalbookingamount,
                                    lessonarr: bookingtemplateData2
                                };

                                activity = {slug: 'payment-done', user_id: data.student_id._id, role: 'learners'};
                                activitytemplate = {
                                    TNAME: t_fname + ' ' + t_lname,
                                    NO_OF_LESSONS: req.body.no_of_lessons,
                                    AMOUNT: paymentInfo.totalbookingamount
                                };

                                activity1 = {slug: 'tutor-booked-info', user_id: data.tutor_id._id, role: 'tutors'};
                                activitytemplate1 = {
                                    LNAME: l_fname + ' ' + l_lname,
                                    SUBJECTNAME: data.subject_id.name
                                };

                                emailServiceObj.sendBookingDetailsMail(tutortemplate, 'tutor');
                                emailServiceObj.sendBookingDetailsMail(learnertemplate, 'learner');
                                activityObj.triggerActivity(activity, activitytemplate);
                                activityObj.triggerActivity(activity1, activitytemplate1);
                            }
                            callback(null, bookingId);
                        }
                    });
        }
    ], function (err, result) {
        if (err) {
            response = {status: 201, message: err};
            res.jsonp(response);
        } else {
            if (!_.isEmpty(result)) {
                response = {status: 200, message: "booking lesson info saved successfully", data: result};
                res.jsonp(response);
            } else {
                response = {status: 201, message: "Event not updated successfully"};
                res.jsonp(response);
            }
        }
    });
}


/*
 * @created         01/11/2016
 * @author          Amanpreet Singh
 * @method          getMyTeachers
 * @description     get all tutor list of student based on booking type
 * @copyright       smartData
 */
function getMyTeachersList(req, res) {
    var fields = {};
    var conditions = {};
    var linkedAccounts = [];

    async.waterfall([
        function (callback) { // get linked accounts
            conditions = {_id: req.params.id};
            fields = {linkedAccounts: 1};
            learnerObj.findOne(conditions, fields)
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            linkedAccounts = _.map(_.filter(data.linkedAccounts, {relation_type: 'child'}), 'linked_id');
                            callback(null, linkedAccounts);
                        }
                    });
        },
        function (linkedAccounts, callback) { // get list of my tutors
            conditions = {student_id: req.params.id};
            bookingObj.find(conditions)
                    .populate([
                        {path: 'student_id', select: 'email personalInfo restrictions'},
                        {path: 'subject_id'},
                        {path: 'level_id'},
                        {path: 'tutor_id', select: 'email personalInfo timeBuffer tutorSubjects createdDate '}
                    ])
                    .lean()
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            var myTeachers = _.map(data, function (element) {
                                return _.extend({}, element, {isLinked: false, accesstype: 'Parent'});
                            });
                            callback(null, myTeachers, linkedAccounts);
                        }
                    });
        },
        function (myTeachers, linkedTeachers, callback) { // get list of linked tutors
            conditions = {student_id: {$in: linkedTeachers}};
            bookingObj.find(conditions)
                    .populate([
                        {
                            path: 'student_id',
                            select: 'email personalInfo linkedAccounts restrictions',
                            populate: {path: 'linkedAccounts.relationship_id', select: 'name sexType'}
                        },
                        {path: 'subject_id'},
                        {path: 'level_id'},
                        {path: 'tutor_id', select: 'email personalInfo timeBuffer tutorSubjects createdDate'}
                    ])
                    .lean()
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {

                            var linkedTeachers = _.map(data, function (element) {
                                return _.extend({}, element, {isLinked: true, accesstype: 'Child'});
                            });

                            var result = _.concat(myTeachers, linkedTeachers);
                            callback(null, result);
                        }
                    });
        }
    ], function (err, result) {
        if (err) {
            res.jsonp({status: 201, msg: err});
        } else {
            res.jsonp({status: 200, msg: "get all data.", data: result});
        }
    });
}

/*
 * @created         02/11/2016
 * @author          Amanpreet Singh
 * @method          getFactSheetBasedOnBookingId
 * @description     get factsheet details based on Booking Id
 * @copyright       smartData
 */
function getFactSheetBasedOnBookingId(req, res) {

    var fields = {};
    var conditions = {
        _id: req.params.id
    };

    bookingObj.findOne(conditions, fields)
            .populate([
                {path: 'student_id'},
                {path: 'subject_id'},
                {path: 'level_id'}
            ])
            .exec(function (err, data) {
                if (err) {
                    res.jsonp({status: 201, msg: err});
                } else {
                    if (_.isNull(data)) {
                        res.jsonp({status: 201, msg: "get all data."});
                    } else {
                        res.jsonp({status: 200, msg: "get all data.", data: data});
                    }
                }
            });

}

/*
 * @created         03/11/2016
 * @author          Amanpreet Singh
 * @method          getProgressBasedOnBookingId
 * @description     get progress details based on Booking Id
 * @copyright       smartData
 */
function getProgressBasedOnBookingId(req, res) {
    var fields = {};
    var conditions = {
        booking_id: req.params.id,
        startDate: {$lte: moment().startOf('day').toISOString()}
    };
    studentTestObj.find(conditions, fields)
            .exec(function (err, data) {
                if (err) {
                    res.jsonp({status: 201, msg: err});
                } else {
                    res.jsonp({status: 200, msg: "get all data.", data: data});
                }
            });
}

/*
 * @created     04/11/2016
 * @author      Amanpreet Singh
 * @desc        get student list so that current tutor can add
 * @copyright   smartData
 */
function getStudentList(req, res) {
    var fields = {
        "personalInfo.firstName": 1,
        "personalInfo.lastName": 1,
        "email": 1,
        "personalInfo.mobileNo": 1
    };
    var query = req.query.q;
    learnerObj.find({$or: [{"personalInfo.firstName": {$regex: query, $options: 'i'}},
            {"personalInfo.lastName": {$regex: query, $options: 'i'}}]},
            fields, function (err, data) {
                if (err || data === null) {
                    console.log('error', err);
                } else {
                    if (data.length === 0) {
                        var list = {};
                    } else {
                        var list = data;
                    }
                    outputJSON = {status: 200, msg: "data sent successfully", data: list};
                    res.jsonp(outputJSON);
                }
            });

}

function getTutorList(req, res) {
    var fields = {
        "personalInfo.firstName": 1,
        "personalInfo.lastName": 1,
        "email": 1,
        "personalInfo.mobileNo": 1
    };
    var query = req.query.q;
    console.log(query);
    tutorObj.find({$or: [{"personalInfo.firstName": {$regex: query, $options: 'i'}},
            {"personalInfo.lastName": {$regex: query, $options: 'i'}}]},
            fields, function (err, data) {
                if (err || data === null) {
                    console.log('error', err);
                } else {
                    if (data.length === 0) {
                        var list = {};
                    } else {
                        var list = data;
                    }
                    outputJSON = {status: 200, msg: "data sent successfully", data: list};
                    res.jsonp(outputJSON);
                }
            });

}

/*
 * @created     04/11/2016
 * @author      Amanpreet Singh
 * @desc        updates various booking information based on section and type
 * @copyright   smartData
 */
function updateBookingInfo(req, res) {
    var type = req.body.type;
    switch (type) {
        case 'Send Request': // when send request made for write feedback
            updateSendStatus(req, req.body, function (response) {
                res.jsonp(response);
            });
            break;
        case 'Write Feedback': // Tutor updates the feedback for cancelled booking
            updateFeedBack(req.body, function (response) {
                res.jsonp(response);
            });
            break;
        case 'Message Pending': // Message updated by tutor for booking from pending section
            messagePendingStudent(req.body, function (response) {
                res.jsonp(response);
            });
            break;
        case 'Message Current': // Message updated by tutor for booking from current section
            messageCurrentStudent(req.body, function (response) {
                res.jsonp(response);
            });
            break;
        case 'Cancel Student': // when tutor cancels a student booking list
            cancelLearnerBooking(req.body, req.headers, function (response) {
                res.jsonp(response);
            });
            break;
        case 'Mark Interview': // when learner or Tutor accepts Interview marked
            markInterview(req.body, function (response) {
                res.jsonp(response);
            });
            break;
        case 'Cancel Tutor': // when learners cancels booking for a tutor
            cancelTutorBooking(req.body, req.headers, function (response) {
                res.jsonp(response);
            });
            break;
        case 'Switch Current': // when tutor shifts learner to current from pending without adding Readiness / Lesson Plan
            shiftTutorBooking(req.body, function (response) {
                res.jsonp(response);
            });
            break;
        default:
            res.jsonp({status: 201, msg: 'Error while updating'});

    }

}

/*
 * @created     07/11/2016
 * @author      Amanpreet Singh
 * @desc        get the list of BackPack subjects of the learner
 * @copyright   smartData
 */
function getBackPackSubjects(req, res) {

    var fields = {};
    var conditions = {};
    var linkedAccounts = [];

    async.waterfall([
        function (callback) { // get linked accounts
            conditions = {_id: req.params.id};
            fields = {linkedAccounts: 1};
            learnerObj.findOne(conditions, fields)
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            linkedAccounts = _.map(_.filter(data.linkedAccounts, {relation_type: 'child'}), 'linked_id');
                            callback(null, linkedAccounts);
                        }
                    });
        },
        function (linkedAccounts, callback) { // get list of my tutors
            conditions = {student_id: req.params.id};
            fields = {tutor_id: 1, subject_id: 1, level_id: 1, no_of_lessons: 1};

            bookingObj.find(conditions, fields)
                    .populate([
                        {path: 'tutor_id', select: 'personalInfo'},
                        {path: 'subject_id', select: 'image name levels'},
                        {path: 'level_id'}
                    ])
                    .lean()
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            var myTeachers = _.map(data, function (element) {
                                return _.extend({}, element, {isLinked: false});
                            });
                            callback(null, myTeachers, linkedAccounts);
                        }
                    });
        },
        function (myTeachers, linkedTeachers, callback) { // get list of linked tutors
            conditions = {student_id: {$in: linkedTeachers}};
            fields = {tutor_id: 1, subject_id: 1, level_id: 1, no_of_lessons: 1, student_id: 1};
            bookingObj.find(conditions)
                    .populate([
                        {path: 'student_id', select: 'personalInfo'},
                        {path: 'tutor_id', select: 'personalInfo'},
                        {path: 'subject_id', select: 'image name levels'},
                        {path: 'level_id'}
                    ])
                    .lean()
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {

                            var linkedTeachers = _.map(data, function (element) {
                                return _.extend({}, element, {isLinked: true});
                            });

                            var result = _.concat(myTeachers, linkedTeachers);
                            callback(null, result);
                        }
                    });
        }
    ], function (err, result) {
        if (err) {
            res.jsonp({status: 201, msg: err});
        } else {
            res.jsonp({status: 200, msg: "get all data.", data: result});
        }
    });

//    bookingObj.find(conditions, fields)
//        .populate([
//            {path: 'tutor_id',select:'personalInfo'},
//            {path: 'subject_id',select:'image name levels'},
//            {path: 'level_id'}
//        ])
//        .exec(function (err, data) {
//            if (err) {
//                res.jsonp({status: 201, msg: err});
//            } else {
//                res.jsonp({status: 200, msg: "get all data.", data: data});
//            }
//        });
}

/*
 * @created     08/11/2016
 * @author      Amanpreet Singh
 * @desc        updates the read status for in class material
 * @copyright   smartData
 */

function updateInClassMaterial(req, res) {
    var value = {};
    var conditions = {
        "_id": req.body.booking_id,
        "shared_plan.lesson.inclassmaterials._id": req.body.material_id
    };
    var field1 = "shared_plan.lesson.$.inclassmaterials." + req.body.material_index + ".isRead";
    var field2 = "shared_plan.lesson.$.inclassmaterials." + req.body.material_index + ".readDate";
    value[field1] = true;
    value[field2] = moment().toISOString();

    bookingObj.update(conditions, {$set: value})
            .exec(function (err, data) {
                if (err) {
                    res.jsonp({status: 201, msg: err});
                } else {
                    res.jsonp({status: 200, msg: "In class material is read.", data: data});
                }
            });
}

/*
 * @created     10/11/2016
 * @author      Amanpreet Singh
 * @desc        get lesson (wizard) information for booking purpose
 * @copyright   smartData
 */
function getToBookLessonDetails(req, res) {

    var fields = {};
    var conditions = {
        added_by: req.body.tutor,
        subject: req.body.subject,
        level: req.body.level,
        wizardtype: 'lesson',
        isDeleted: false
    };

    wizardObj.find(conditions, fields)
            .populate([
                {path: 'subject'},
                {path: 'package_id'}
            ])
            .exec(function (err, data) {
                if (err) {
                    res.jsonp({status: 201, msg: err});
                } else {
                    res.jsonp({status: 200, msg: "get lesson info details.", data: data});
                }
            });
}

// Private Functions

/*
 * @created     04/11/2016
 * @author      Amanpreet Singh
 * @desc        updates send status for the booking
 * @copyright   smartData
 */
function updateSendStatus(req, input, callback) {
    var conditions = {
        _id: input.booking_id
    };

    bookingObj.findOneAndUpdate(conditions, {$set: {requestSent: true}}, {new : true})
            .exec(function (err, data) {
                if (err) {
                    callback({status: 201, msg: err});
                } else {

                    var booking_id = input.booking_id;
                    bookingObj.findOne({"_id": booking_id})
                            .populate([
                                {path: 'tutor_id', select: 'personalInfo.firstName email'},
                                {path: 'student_id', select: 'personalInfo.firstName email _id'},
                                {path: 'subject_id', select: 'name'}
                            ])
                            .lean()
                            .exec(function (err, data) {
                                if (data) {
                                    var templateData = {};
                                    templateData.emailTo = data.student_id.email;
                                    templateData.emailToName = (data.student_id.personalInfo.firstName) ? data.student_id.personalInfo.firstName : 'Learner';
                                    templateData.tutorName = (data.tutor_id.personalInfo.firstName) ? data.tutor_id.personalInfo.firstName : 'Tutor';
                                    templateData.subject_name = data.subject_id.name;
                                    var review_url = req.protocol + '://' + req.headers.host + '/#!/reviewtutor/' + booking_id;
                                    templateData.review_url = review_url;
                                    emailServiceObj.sendReviewRequestMail(templateData);
                                }
                            });

                    callback({status: 200, msg: "Request sent.", data: data});
                }
            });
}

/*
 * @created     04/11/2016
 * @author      Amanpreet Singh
 * @desc        writes feedback  message for the specific booking by the tutor
 * @copyright   smartData
 */
function updateFeedBack(input, callback) {
    var conditions = {
        _id: input.booking_id
    };

    bookingObj.findOneAndUpdate(conditions, {$set: {isTutorRated: true}}, {new : true})
            .exec(function (err, data) {
                if (err) {
                    callback({status: 201, msg: err});
                } else {
                    callback({status: 200, msg: "Feedback updated.", data: data});
                }
            });

}


/*
 * @created     04/11/2016
 * @author      Amanpreet Singh
 * @desc        cancel pending student
 * @copyright   smartData
 */
function cancelPendingStudent(input, callback) {
    var conditions = {
        _id: input.booking_id
    };

    var fields = {
        current_booking_status: 'Cancelled',
        cancellation_info: {
            cancellation_status: 'Pending Refund',
            cancelled_by: 'tutor',
            cancellation_reason: input.reason
        },
        cancellation_policy: {
            refundPolicy: input.policy
        }
    };
    bookingObj.findOneAndUpdate(conditions, {$set: fields}, {new : true})
            .populate([
                {path: 'student_id'},
                {path: 'subject_id'},
                {path: 'level_id'},
                {path: 'tutor_id', select: 'refundPolicy'}
            ])
            .exec(function (err, data) {
                if (err) {
                    callback({status: 201, msg: err});
                } else {
                    callback({status: 200, msg: "Student Cancelled", data: data});
                }
            });
}

/*
 * @created     04/11/2016
 * @author      Amanpreet Singh
 * @desc        sends message to Pending student
 * @copyright   smartData
 */
function messagePendingStudent(input, callback) {
    callback({status: 200, msg: 'Message sent successfully.'});
}

/*
 * @created     04/11/2016
 * @author      Amanpreet Singh
 * @desc        cancel pending student
 * @copyright   smartData
 */
function cancelCurrentStudent(input, callback) {
    var conditions = {
        _id: input.booking_id
    };
    var fields = {
        current_booking_status: 'Cancelled',
        cancellation_info: {
            cancellation_status: 'Pending Refund',
            cancelled_by: 'tutor',
            cancellation_reason: input.reason
        },
        cancellation_policy: {
            refundPolicy: input.policy
        }
    };
    bookingObj.findOneAndUpdate(conditions, {$set: fields}, {new : true})
            .populate([
                {path: 'student_id'},
                {path: 'subject_id'},
                {path: 'level_id'},
                {path: 'tutor_id', select: 'refundPolicy'}
            ])
            .exec(function (err, data) {
                if (err) {
                    callback({status: 201, msg: err});
                } else {
                    callback({status: 200, msg: "Student Cancelled", data: data});
                }
            });
}

/*
 * @created     04/11/2016
 * @author      Amanpreet Singh
 * @desc        sends message to Current student
 * @copyright   smartData
 */
function messageCurrentStudent(input, callback) {
    callback({status: 200, msg: 'Message sent successfully.'});
}


/*
 * @created     21/11/2016
 * @author      Amanpreet Singh
 * @desc        get Tutor Business Hours
 * @copyright   smartData
 */
function getTutorBusinessHours(req, res) {
    var conditions = {
        _id: req.params.id
    };

    var fields = {
        businessHours: 1
    };
    if (req.query.type) {
        var type = _.toLower(req.query.type);
    } else {
        var type = null;
    }

    var businessHours = [];

    tutorObj.findOne(conditions, fields)
            .exec(function (err, data) {
                if (err) {
                    res.jsonp({status: 201, msg: err});
                } else {
                    if (data) {
                        if (type !== 'all' && type !== null) {
                            businessHours = _.filter(data.businessHours, function (v) {
                                return (v.type === type || v.type === 'all');
                            });
                        } else {
                            businessHours = data.businessHours;
                        }
                        res.jsonp({status: 200, msg: "Data sent successfully", data: businessHours});
                    } else {
                        res.jsonp({status: 200, msg: "No events found"});
                    }
                }
            });
}

/*
 * @created     21/11/2016
 * @author      Amanpreet Singh
 * @desc        save Tutor Business Hours
 * @copyright   smartData
 */
function saveTutorBusinessHours(req, res) {
    var conditions = {
        _id: req.body.id
    };

    var fields = {
        businessHours: 1
    };
    var checkEvent = [];
    var removetype = [];
    var event = req.body.event;
    var checkStartDate = moment(req.body.event.start);
    var checkEndDate = moment(req.body.event.end);

    var startDate = moment(req.body.event.start).format("HH:mm:ss");
    var endDate = moment(req.body.event.end).format("HH:mm:ss");
    var dow = moment(req.body.event.start).weekday();
    // Manipulates the event Object
    event.start = startDate;
    event.end = endDate;
    event.dow = [dow];

    if (event.type === 'enrichment' || event.type === 'academics') {
        removetype = ['all'];
    }
    if (event.type === 'all') {
        removetype = ['enrichment', 'academics'];
    }

    async.series([
        function (callback) { // checks if same event is not added twice
            tutorObj.findOne(conditions, fields)
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            var businessHours = data.businessHours;
                            var weekStart = moment().startOf('week').toArray();

                            _.forEach(businessHours, function (key) {
                                var dow = key.dow[0];
                                var startTime = _.split(key.start, ':');
                                var endTime = _.split(key.end, ':');
                                var startHour = startTime[0];
                                var startMinute = startTime[1];
                                var startSecond = startTime[2];
                                var endHour = endTime[0];
                                var endMinute = endTime[1];
                                var endSecond = endTime[2];

                                var startEvent = moment().set(
                                        {
                                            'year': weekStart[0],
                                            'month': weekStart[1],
                                            'date': weekStart[2] + dow,
                                            'hour': startHour,
                                            'minute': startMinute,
                                            'second': startSecond,
                                            'millisecond': 0
                                        });

                                var endEvent = moment().set(
                                        {
                                            'year': weekStart[0],
                                            'month': weekStart[1],
                                            'date': weekStart[2] + dow,
                                            'hour': endHour,
                                            'minute': endMinute,
                                            'second': endSecond
                                        });
                                // checks if event does not conflict previous events        
                                if (Math.round(startEvent) / 1000 < Math.round(checkEndDate) / 1000 && Math.round(endEvent) > Math.round(checkStartDate)) {
                                    checkEvent.push(true);
                                }
                            });

                            if (checkEvent.length > 0) {
                                err = 'Event already exists for the time selected';
                                return callback(err);
                            } else {
                                callback(null, data);
                            }
                        }
                    });
        },
        function (callback) { // Removes the unwanted events based on type
            tutorObj.findOneAndUpdate(conditions, {$pull: {businessHours: {"type": {$in: removetype}}}})
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            callback(null, data);
                        }
                    });
        },
        function (callback) { // updates the new event
            tutorObj.findOneAndUpdate(conditions, {$push: {businessHours: event}})
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            callback(null, data);
                        }
                    });
        }
    ], function (err, result) {
        if (err) {
            var response = {status: 201, message: err};
            res.jsonp(response);
        } else {
            if (result.length > 0) {
                var response = {status: 200, message: "Event saved successfully"};
                res.jsonp(response);
            } else {
                var response = {status: 201, message: "Event not saved successfully"};
                res.jsonp(response);
            }

        }
    });

}

/*
 * This function is used to get the Non Availability time of tutor i.e Booked period
 */
function getTutorNonAvailability(req, res) {
    var conditions = {
        tutor_id: req.params.id,
        start: {$gte: moment(req.query.start).toISOString(), $lt: moment(req.query.end).toISOString()},
        isDeleted: false,
        enable: true
    };
    var fields = {};
    var response = {};

    scheduleObj.find(conditions)
            .populate([
                {path: 'student_id', select: 'personalInfo'},
                {path: 'subject_id', select: 'color type'},
                {path: 'booking_id', select: 'reschedule_policy cancellation_policy'}
            ])
            .exec(function (err, data) {
                if (err) {
                    response = {status: 201, message: "No events found"};
                    res.jsonp(response);
                } else {
                    response = {status: 200, message: "Event fetched successfully", data: data};
                    res.jsonp(response);
                }
            });

}

/*
 * This function is used to edit Schedule event from Tutor's end
 */
function editTutorScheduleEvent(req, res) {

    var currentdate = moment(); // current date
    var conditions = {
        "$or": [
            {"tutor_id": ObjectId(req.body.tutor_id)},
            {"student_id": ObjectId(req.body.student_id)}
        ],
        start: {
            $gte: moment(req.body.start).startOf('week').toISOString(),
            $lt: moment(req.body.start).endOf('week').toISOString()
        },
        isDeleted: false,
        enable: true
    };

    var updateConditions = {
        _id: ObjectId(req.body._id)
    };
    var updateFields = {
        start: req.body.start,
        end: req.body.end,
        reschedule_info: {},
        schedule_status: 'pending'
    };
    var bookingConditions = {
        "_id": req.body.booking_id,
        "booking_info._id": req.body.lesson_id
    };
    var penalty_amount = req.body.penalty_amount;

    var templateData = {}; // for notifications
    var activity = {}; // for recent activity
    var activitytemplate = {};
    var rescheduleLog = {};
    var response = {};
    var wallet_data = {};
    var pushData = {}; // for push notification
    var userObj = {}; // user object for push notification
    var jsonobj = {noti_section: 'lesson_notification', noti_data: {}};

    // Reschedule Log
    rescheduleLog = {
        tutor_id: ObjectId(req.body.tutor_id),
        booking_id: ObjectId(req.body.booking_id._id),
        student_id: ObjectId(req.body.student_id),
        lesson_id: ObjectId(req.body.lesson_id),
        reschedule_by: 'learner',
        original_date: req.body.prevdate,
        new_date: req.body.start,
        reschedule_status: 'Confirmed'
    };

    wallet_data = {
        wallet_type: req.body.subject_type,
        wallet_desc: 'For Reschedule of lesson',
        wallet_user: {
            role: 'tutors',
            user: ObjectId(req.body.tutor_id)
        },
        booking_id: ObjectId(req.body.booking_id._id),
        credit_amount: penalty_amount
    };

    var checkEvent = [];
    var checkStartDate = moment(req.body.start);
    var checkEndDate = moment(req.body.end);

    async.waterfall([
        function (callback) { // To check if event does not overlap with other events
            scheduleObj.find(conditions)
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            //var events = data;
                            var events = _.reject(data, {"_id": ObjectId(req.body._id)});

                            _.forEach(events, function (key) {
                                var startEvent = moment(key.start);
                                var endEvent = moment(key.end);
                                // checks if event does not conflict previous events        
                                if (Math.round(startEvent) / 1000 < Math.round(checkEndDate) / 1000 && Math.round(endEvent) > Math.round(checkStartDate)) {
                                    checkEvent.push(true);
                                }
                            });
                            if (checkEvent.length > 0) {
                                err = 'Another event either for Tutor or Learner already exists for the selected time';
                                return callback(err);
                            } else {
                                callback(null, true);
                            }
                        }
                    });
        },
        function (status, callback) { // update the schedule event
            scheduleObj.findOneAndUpdate(updateConditions, {$set: updateFields}, {new : true})
                    .exec(function (err) {
                        if (err) {
                            return callback(err);
                        } else {
                            callback(null, true);
                        }
                    });
        },
        function (status, callback) { // update the booking event
            bookingObj.findOneAndUpdate(bookingConditions,
                    {$set: {"booking_info.$.start": req.body.start, "booking_info.$.end": req.body.end}}, {new : true})
                    .populate([
                        {path: 'student_id', select: 'personalInfo email currTimeOffset deviceId'},
                        {path: 'subject_id', select: 'name'},
                        {path: 'tutor_id', select: 'personalInfo email currTimeOffset deviceId'},
                        {path: 'level_id', select: 'name'}
                    ])
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            callback(null, data);
                        }
                    });
        },
        function (data, callback) { // wallet data
            if (penalty_amount > 0) {
                var reference_no = data.booking_ref;
                var receipt_no = biguint(crypto.randomBytes(4), 'dec', {groupsize: 5, delimiter: '-'});

                wallet_data = _.extend({}, wallet_data, {
                    reference_no: reference_no,
                    receipt_no: receipt_no
                });

                walletObj(wallet_data).save(function (err) {
                    if (err) {
                        return callback(err);
                    } else {
                        callback(null, data);
                    }
                });
            } else {
                callback(null, data);
            }
        },
        function (scheduleData, callback) { // save request session log
            reschedulelessionlogObj(rescheduleLog).save(function (err) {
                if (err) {
                    return callback(err);
                } else {
                    callback(null, scheduleData);
                }
            });
        },

        function (scheduleData, callback) { // email notifications and recent activities
            var l_fname = (scheduleData.student_id.personalInfo.firstName) ? (scheduleData.student_id.personalInfo.firstName) : 'Learner';
            var l_lname = (scheduleData.student_id.personalInfo.lastName) ? (scheduleData.student_id.personalInfo.lastName) : '';
            var l_name = l_fname + ' ' + l_lname;
            var t_fname = (scheduleData.tutor_id.personalInfo.firstName) ? (scheduleData.tutor_id.personalInfo.firstName) : 'Tutor';
            var t_lname = (scheduleData.tutor_id.personalInfo.lastName) ? (scheduleData.tutor_id.personalInfo.lastName) : '';
            var t_name = t_fname + ' ' + t_lname;
            templateData = {
                emailTo: scheduleData.student_id.email,
                emailToName: l_name,
                acceptedby: t_name,
                subject_name: scheduleData.subject_id.name,
                level_name: scheduleData.level_id.name
            };
            emailServiceObj.sendRescheduleAcceptance(templateData);

            //push notification in case of reschedule
            if (scheduleData.student_id && scheduleData.student_id.deviceId) {
                pushData = {
                    title: 'Reschedule request accepted',
                    body: t_name + ' has accepted the request for reschedule of lesson for ' + scheduleData.subject_id.name,
                    jsonobj: jsonobj
                };

                userObj = {
                    senderId: '',
                    senderType: '',
                    receiverId: scheduleData.student_id._id,
                    receiverType: 'learners'
                };
                pushNoti.sendPushNotificationByUserId(userObj, pushData);
            }

            activity = {slug: 'lesson-reschedule-learner', user_id: scheduleData.student_id._id, role: 'learners'};
            activitytemplate = {TNAME: t_fname + ' ' + t_lname, SUBJECTNAME: scheduleData.subject_id.name};
            activityObj.triggerActivity(activity, activitytemplate);

            // Recent Activity
//            conditions = {
//                "tutor_id": ObjectId(req.body.tutor_id),
//                "student_id": ObjectId(req.body.student_id),
//                "createdDate" : {
//                    $gte : moment(currentdate).startOf('month').toISOString(), 
//                    $lte : moment(currentdate).endOf('month').toISOString()
//                },
//                "reschedule_by" : 'learner',
//                "isDeleted" : false
//            };
//            
//            reschedulelessionlogObj
//                    .count(conditions)
//                    .exec(function (err, count) {
//                        if (err) {
//                            console.log('err',err);
//                        } else {
//                            if (count === 2 || count === 3) {
//                                if (count === 2) {
//                                    activity = {slug: 'twice-reschedule-learner', user_id: req.body.tutor_id, role: 'tutors'};
//                                }
//                                if (count === 3) {
//                                    activity = {slug: 'thrice-reschedule-learner', user_id: req.body.tutor_id, role: 'tutors'};
//                                }
//
//                                activitytemplate = {
//                                    LNAME: l_fname + ' ' + l_lname
//                                };
//                                //recent activity for recehedule
//                                activityObj.triggerActivity(activity, activitytemplate);
//                            } else if(count === 1) {
//                                activity = {slug: 'lesson-reschedule-learner', user_id: req.body.tutor_id, role: 'tutors'};
//                                activitytemplate = { LNAME: l_fname + ' ' + l_lname };
//                                
//                                //recent activity for recehedule
//                                activityObj.triggerActivity(activity, activitytemplate);
//                            } else {
//                                // Not valid for recent activity
//                            }
//                        }
//                    });

            callback(null, true);
        }
    ], function (err, result) {
        if (err) {
            console.log('err', err);
            response = {status: 201, message: err};
            res.jsonp(response);
        } else {
            if (result === true) {
                response = {status: 200, message: "Event updated successfully"};
                res.jsonp(response);
            } else {
                response = {status: 201, message: "Event not updated successfully"};
                res.jsonp(response);
            }
        }
    });
}

/*
 * This function is used to edit Business Hours based on event selected
 */
function editBusinessHours(req, res) {

    var conditions = {
        _id: ObjectId(req.body.id),
        businessHours: {$elemMatch: {"_id": ObjectId(req.body.event.id)}}
    };

    var eventType = req.body.type;

    var startDate = moment(req.body.event.start).format("HH:mm:ss");
    var endDate = moment(req.body.event.end).format("HH:mm:ss");
    var dow = moment(req.body.event.start).weekday();

    if (eventType === 'Update') {
        var updateFields = {
            "businessHours.$.start": startDate,
            "businessHours.$.end": endDate,
            "businessHours.$.dow": [dow]
        };
    } else if (eventType === 'Delete') {
        var updateFields = {
            "_id": ObjectId(req.body.event.id)
        };
    }

    if (eventType === 'Update') {
        tutorObj.findOneAndUpdate(conditions, {$set: updateFields}, {new : true})
                .exec(function (err, data) {
                    if (err) {
                        res.jsonp({status: 201, message: err});
                    } else {
                        res.jsonp({status: 200, message: 'Record fetched successfully'});
                    }
                });
    }
    if (eventType === 'Delete') {
        tutorObj.findOneAndUpdate(conditions, {$pull: {businessHours: updateFields}}, {new : true})
                .exec(function (err, data) {
                    if (err) {
                        res.jsonp({status: 201, message: err});
                    } else {
                        res.jsonp({status: 200, message: 'Record fetched successfully'});
                    }
                });
    }
}

/*
 * This function is used to create a personal event for the tutor
 */
function createTutorExceptionEvent(req, res) {

    var conditions = {
        tutor_id: ObjectId(req.body.tutor_id),
        start: {
            $gte: moment(req.body.start).startOf('week').toISOString(),
            $lt: moment(req.body.start).endOf('week').toISOString()
        },
        isDeleted: false
    };

    scheduleData = req.body;

    var checkEvent = [];
    var checkStartDate = moment(req.body.start);
    var checkEndDate = moment(req.body.end);

    var response = {};

    async.series([
        function (callback) {
            scheduleObj.find(conditions)
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            var events = _.reject(data, {"_id": ObjectId(req.body._id)});

                            _.forEach(events, function (key) {
                                var startEvent = moment(key.start);
                                var endEvent = moment(key.end);
                                // checks if event does not conflict previous events        
                                if (Math.round(startEvent) / 1000 < Math.round(checkEndDate) / 1000 && Math.round(endEvent) > Math.round(checkStartDate)) {
                                    checkEvent.push(true);
                                }
                            });
                            if (checkEvent.length > 0) {
                                err = 'Another event already exists for the selected time';
                                return callback(err);
                            } else {
                                callback(null, data);
                            }
                        }
                    });
        },
        function (callback) {
            scheduleObj(scheduleData).save(function (err, data) {
                if (err) {
                    return callback(err);
                } else {
                    callback(null, data);
                }
            });
        }
    ], function (err, result) {
        if (err) {
            response = {status: 201, message: err};
            res.jsonp(response);
        } else {
            if (result.length > 0) {
                response = {status: 200, message: "Event added successfully"};
                res.jsonp(response);
            } else {
                response = {status: 201, message: "Event not added successfully"};
                res.jsonp(response);
            }

        }
    });
}

/*
 * This function is used to get the Non Availability time of tutor i.e Booked period
 */
function getLearnerNonAvailability(req, res) {
    var conditions = {
        student_id: req.params.id,
        start: {$gte: moment(req.query.start).toISOString(), $lt: moment(req.query.end).toISOString()},
        isDeleted: false,
        enable: true
    };
    var fields = {};
    var response = {};

    scheduleObj.find(conditions)
            .populate([
                {path: 'tutor_id', select: 'personalInfo'},
                {path: 'subject_id', select: 'color type'},
                {path: 'booking_id', select: 'reschedule_policy cancellation_policy'}
            ])
            .exec(function (err, data) {
                if (err) {
                    response = {status: 201, message: "No events found"};
                    res.jsonp(response);
                } else {
                    response = {status: 200, message: "Event fetched successfully", data: data};
                    res.jsonp(response);
                }
            });

}

/*
 * This function is used to edit Schedule event from Learner's end
 */
function editLearnerScheduleEvent(req, res) {

    var currentdate = moment(); // current date
    var conditions = {
        "$or": [
            {"tutor_id": ObjectId(req.body.tutor_id)},
            {"student_id": ObjectId(req.body.student_id)}
        ],
        start: {
            $gte: moment(req.body.start).startOf('week').toISOString(),
            $lt: moment(req.body.start).endOf('week').toISOString()
        },
        isDeleted: false,
        enable: true
    };
    var updateConditions = {
        _id: ObjectId(req.body._id)
    };

    var updateFields = {
        start: req.body.start,
        end: req.body.end,
        reschedule_info: {},
        schedule_status: 'pending'
    };

    var bookingConditions = {
        "_id": req.body.booking_id,
        "booking_info._id": req.body.lesson_id
    };

    var penalty_amount = req.body.penalty_amount;

    var templateData = {}; // for notifications
    var activity = {}; // for recent activity
    var activitytemplate = {};
    var rescheduleLog = {};
    var wallet_data = {};
    var pushData = {};
    var userObj = {};

    // Reschedule Log
    rescheduleLog = {
        tutor_id: ObjectId(req.body.tutor_id),
        booking_id: ObjectId(req.body.booking_id._id),
        student_id: ObjectId(req.body.student_id),
        lesson_id: ObjectId(req.body.lesson_id),
        reschedule_by: 'tutor',
        original_date: req.body.prevdate,
        new_date: req.body.start,
        reschedule_status: 'Confirmed'
    };

    wallet_data = {
        wallet_type: req.body.subject_type,
        wallet_desc: 'For Reschedule of lesson',
        wallet_user: {
            role: 'learners',
            user: ObjectId(req.body.student_id)
        },
        credit_amount: penalty_amount,
        booking_id: ObjectId(req.body.booking_id._id)
    };

    var checkEvent = [];
    var checkStartDate = moment(req.body.start);
    var checkEndDate = moment(req.body.end);

    var response = {};

    async.waterfall([
        function (callback) { // To check if event does not overlap with other events
            scheduleObj.find(conditions)
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            var events = _.reject(data, {"_id": ObjectId(req.body._id)}); // In case of removal

                            _.forEach(events, function (key) {
                                var startEvent = moment(key.start);
                                var endEvent = moment(key.end);
                                // checks if event does not conflict previous events        
                                if (Math.round(startEvent) / 1000 < Math.round(checkEndDate) / 1000 && Math.round(endEvent) > Math.round(checkStartDate)) {
                                    checkEvent.push(true);
                                }
                            });
                            if (checkEvent.length > 0) {
                                err = 'Another event either for Tutor or Learner already exists for the selected time';
                                return callback(err);
                            } else {
                                callback(null, true);
                            }
                        }
                    });
        },
        function (event, callback) { // update the schedule event
            scheduleObj.findOneAndUpdate(updateConditions, {$set: updateFields}, {new : true})
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            callback(null, true);
                        }
                    });
        },
        function (event, callback) { // update the booking event
            bookingObj.findOneAndUpdate(bookingConditions,
                    {$set: {"booking_info.$.start": req.body.start, "booking_info.$.end": req.body.end}}, {new : true})
                    .populate([
                        {path: 'student_id', select: 'personalInfo email currTimeOffset deviceId '},
                        {path: 'subject_id', select: 'name'},
                        {path: 'tutor_id', select: 'personalInfo email currTimeOffset deviceId '},
                        {path: 'level_id', select: 'name'}
                    ])
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            callback(null, data);
                        }
                    });
        },
        function (scheduleData, callback) { // wallet data
            if (penalty_amount > 0) {
                var reference_no = scheduleData.booking_ref;
                var receipt_no = biguint(crypto.randomBytes(4), 'dec', {groupsize: 5, delimiter: '-'});

                wallet_data = _.extend({}, wallet_data, {
                    reference_no: reference_no,
                    receipt_no: receipt_no
                });

                walletObj(wallet_data).save(function (err) {
                    if (err) {
                        return callback(err);
                    } else {
                        callback(null, scheduleData);
                    }
                });
            } else {
                callback(null, scheduleData);
            }
        },
        function (scheduleData, callback) { // request session log
            reschedulelessionlogObj(rescheduleLog).save(function (err) {
                if (err) {
                    return callback(err);
                } else {
                    callback(null, scheduleData);
                }
            });
        },
        function (scheduleData, callback) { // email notifications and recent activities
            var l_fname = (scheduleData.student_id.personalInfo.firstName) ? (scheduleData.student_id.personalInfo.firstName) : 'Learner';
            var l_lname = (scheduleData.student_id.personalInfo.lastName) ? (scheduleData.student_id.personalInfo.lastName) : '';
            var l_name = l_fname + ' ' + l_lname;
            var t_fname = (scheduleData.tutor_id.personalInfo.firstName) ? (scheduleData.tutor_id.personalInfo.firstName) : 'Tutor';
            var t_lname = (scheduleData.tutor_id.personalInfo.lastName) ? (scheduleData.tutor_id.personalInfo.lastName) : '';
            var t_name = t_fname + ' ' + t_lname;
            templateData = {
                emailTo: scheduleData.tutor_id.email,
                emailToName: t_name,
                acceptedby: l_name,
                subject_name: scheduleData.subject_id.name,
                level_name: scheduleData.level_id.name
            };
            emailServiceObj.sendRescheduleAcceptance(templateData);

            //push notification in case of reschedule
            if (scheduleData.tutor_id && scheduleData.tutor_id.deviceId) {
                var jsonobj = {noti_section: 'lesson_notification', noti_data: {}};

                pushData = {
                    title: 'Reschedule request accepted',
                    body: l_name + ' has accepted the request for reschedule of lesson for ' + scheduleData.subject_id.name,
                    jsonobj: jsonobj
                };

                userObj = {
                    senderId: '',
                    senderType: '',
                    receiverId: scheduleData.tutor_id._id,
                    receiverType: 'tutors'
                };
                pushNoti.sendPushNotificationByUserId(userObj, pushData);
            }

            // Recent Activity
            activity = {slug: 'lesson-reschedule-tutor', user_id: scheduleData.tutor_id._id, role: 'tutors'};
            activitytemplate = {LNAME: l_fname + ' ' + l_lname, SUBJECTNAME: scheduleData.subject_id.name};
            activityObj.triggerActivity(activity, activitytemplate);
//            conditions = {
//                "tutor_id": ObjectId(req.body.tutor_id),
//                "student_id": ObjectId(req.body.student_id),
//                "createdDate" : {
//                    $gte : moment(currentdate).startOf('month').toISOString(), 
//                    $lte : moment(currentdate).endOf('month').toISOString()
//                },
//                "reschedule_by" : 'tutor',
//                "isDeleted" : false
//            };

//            reschedulelessionlogObj
//                    .count(conditions)
//                    .exec(function (err, count) {
//                        if (err) {
//                            console.log('err',err);
//                        } else {
//                            if (count === 2 || count === 3) {
//                                if (count === 2) {
//                                    activity = {slug: 'twice-reschedule-tutor', user_id: req.body.tutor_id, role: 'learners'};
//                                }
//                                if (count === 3) {
//                                    activity = {slug: 'thrice-reschedule-tutor', user_id: req.body.tutor_id, role: 'learners'};
//                                }
//
//                                activitytemplate = {
//                                    TNAME: t_fname + ' ' + t_lname
//                                };
//                                
//                                //recent activity for recehedule
//                                activityObj.triggerActivity(activity, activitytemplate);
//                            } else if (count === 1 ) {
//                                activity = {slug: 'lesson-reschedule-tutor', user_id: req.body.tutor_id, role: 'learners'};
//                                activitytemplate = { TNAME: t_fname + ' ' + t_lname };
//                                
//                                //recent activity for recehedule
//                                activityObj.triggerActivity(activity, activitytemplate);
//                            } else {
//                                // Not valid for recent activity
//                            }
//                        }
//                    });

            callback(null, true);
        }
    ], function (err, result) {
        if (err) {
            response = {status: 201, message: err};
            res.jsonp(response);
        } else {
            if (result === true) {
                response = {status: 200, message: "Event updated successfully"};
                res.jsonp(response);
            } else {
                response = {status: 201, message: "Event not updated successfully"};
                res.jsonp(response);
            }
        }
    });
}

/*
 * This function is used to get the distinct subject list of learner 
 */
function getLearnerSubjectsList(req, res) {

    var conditions = {
        student_id: ObjectId(req.params.id),
        isDeleted: false
    };

    var fields = {
    };

    bookingObj.find(conditions, fields)
            .populate([
                {path: 'subject_id', select: 'name color'}
            ])
            .exec(function (err, data) {
                if (err) {
                    res.jsonp({status: 201, msg: err});
                } else {
                    res.jsonp({status: 200, msg: "get all data.", data: data});
                }
            });
}

/*
 * this function is used to save tutor feedback for the test taken
 */
function saveTutorFeedback(req, res) {

    var conditions = {
        _id: req.body.id
    };
    var fields = {tutor_feedback: req.body.feedback};
    var activity;
    var activitytemplate;
    var template;

    studentTestObj.findOneAndUpdate(conditions, {$set: fields}, {new : true})
            .populate({path: 'student_id', select: 'personalInfo'})
            .exec(function (err, data) {
                if (err) {
                    res.jsonp({status: 201, msg: err});
                } else {
                    // activity 
                    activity = {slug: 'tutor-feedback', user_id: data.tutor_id};
                    activitytemplate = {
                        LNAME: data.student_id.personalInfo.firstName + ' ' + data.student_id.personalInfo.lastName
                    };
                    activityObj.triggerActivity(activity, activitytemplate);
                    res.jsonp({status: 200, msg: "feedback updated."});
                }
            });
}

/*
 * this function is used to get the upcoming events for tutor & learner
 */
function getUpcomingEvents(req, res) {
    var type = req.body.type; // to check learner or tutor
    var upcoming_type = req.body.upcoming_type;
    var event_type = req.body.eventtype;
    var start = moment().startOf('day').toISOString();
    var conditions = {};
    
    if (type === 'tutor') {

        async.series([
            function (callback) { // count the no of events
                conditions = {tutor_id: ObjectId(req.body.tutor_id),isDeleted:false, start: {$gte: new Date(start)}};
                scheduleObj
                        .aggregate([
                            {$match: conditions},
                            {$group: {"_id": {"status": "$schedule_status", "type": "$type"}, count: {$sum: 1}}}
                        ])
                        .exec(function (err, data) {
                            if (err) {
                                return callback(err);
                            } else {
                                callback(null, data);
                            }
                        });
            },
            function (callback) { // list the upcoming booking events
                conditions = {
                    "tutor_id": ObjectId(req.body.tutor_id),
                    "isDeleted":false,
                    "start": {
                        $gte: moment().startOf('day').toISOString()
                    }
                };
                if (upcoming_type !== 'all') {
                    conditions = _.extend({}, conditions, {schedule_status: upcoming_type, type: event_type});
                } else {
                    conditions = _.extend({}, conditions, {schedule_status: {$in: ['pending', 'rescheduled']}, type:{$nin:['exception']}});
                }
                scheduleObj
                        .find(conditions)
                        .populate([
                            {path: 'tutor_id', select: 'personalInfo'},
                            {path: 'student_id', select: 'personalInfo'},
                            {path: 'subject_id', select: 'name type'},
                            {path: 'booking_id', select: 'booking_info location interviewschedule reschedule_policy'}
                        ])
                        .sort({"start": 1})
                        //.limit(5)
                        .exec(function (err, data) {
                            if (err) {
                                return callback(err);
                            } else {
                                callback(null, data);
                            }
                        });
            }
        ], function (err, result) {
            if (err) {
                res.jsonp({status: 201, msg: err});
            } else {
                res.jsonp({status: 200, msg: 'Data fetched successfully', data: result});
            }
        });
    }
    
    if (type === 'learner') {

        async.series([
            function (callback) {
                conditions = {student_id: ObjectId(req.body.student_id), isDeleted:false,start: {$gte: new Date(start)}};

                scheduleObj
                        .aggregate([
                            {$match: conditions},
                            {$group: {"_id": {"status": "$schedule_status", "type": "$type"}, count: {$sum: 1}}}
                        ])
                        .exec(function (err, data) {
                            if (err) {
                                return callback(err);
                            } else {
                                callback(null, data);
                            }
                        });
            },
            function (callback) {

                conditions = {
                    "student_id": ObjectId(req.body.student_id),
                    "start": {
                        $gte: moment().startOf('day').toISOString()
                    }
                };
                if (upcoming_type !== 'all') {
                    conditions = _.extend({}, conditions, {schedule_status: upcoming_type, type: event_type});
                } else {
                    conditions = _.extend({}, conditions, {schedule_status: {$in: ['pending', 'rescheduled']}});
                }

                scheduleObj
                        .find(conditions)
                        .populate([
                            {path: 'tutor_id', select: 'personalInfo'},
                            {path: 'student_id', select: 'personalInfo'},
                            {path: 'subject_id', select: 'name type'},
                            {path: 'booking_id', select: 'booking_info location interviewschedule reschedule_policy'}
                        ])
                        .sort({"start": 1})
                        //.limit(5)
                        .exec(function (err, data) {
                            if (err) {
                                return callback(err);
                            } else {
                                callback(null, data);
                            }
                        });
            }
        ], function (err, result) {
            if (err) {
                res.jsonp({status: 201, msg: err});
            } else {
                res.jsonp({status: 200, msg: 'Data fetched successfully', data: result});
            }
        });
    }

}

/*
 * 
 */
function getTutorPolicies(req, res) {
    var conditions = {};
    var fields = {};
    var response = {};

    async.waterfall([
        function (callback) { // find tutor current refund policy

            conditions = {_id: req.params.id};
            fields = {refundPolicy: 1};

            tutorObj.findOne(conditions, fields)
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            var refundPolicy = data.refundPolicy;
                            callback(null, refundPolicy);
                        }
                    });
        },
        function (policy, callback) {
            conditions = {policy_slug: policy};

            adminPolicyObj.findOne(conditions)
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            callback(null, data);
                        }
                    });
        }
    ], function (err, result) {
        if (err) {
            response = {status: 201, message: err};
            res.jsonp(response);
        } else {
            if (!_.isEmpty(result)) {
                response = {status: 200, data: result};
                res.jsonp(response);
            } else {
                response = {status: 201, message: 'No record found'};
                res.jsonp(response);
            }
        }
    });

}

/*
 * this function will be called when request for Reschedule has been initiated from learner end
 */
function requestForRescheduleAtLearner(req, res) {
    // Stripe Object
    var stripeCredentials = process.LaSec['stripe-credentials'];
    var stripe = require('stripe')(stripeCredentials.stripe_secret_key);

    var conditions = {};
    var reschedule_info = {};

    var updateConditions = {
        _id: ObjectId(req.body._id)
    };
    var booking_id = req.body.booking_id;
    var lesson_id = req.body.lesson_id;

    var penalty_amount = req.body.penalty_amount; //converting to actual value
    var token = req.body.token;
    var stripe_data = {};
    var wallet_data = {};
    var payment_log = {};
    var pushData = {};
    var userObj = {};
    var jsonobj = {noti_section: 'lesson_notification', noti_data: {}};
    var activity = {};
    var activitytemplate = {};

    var checkEvent = [];
    var checkStartDate = moment(req.body.start);
    var checkEndDate = moment(req.body.end);
    var templateData = {};
    var reschedule_policy = req.body.resechedule_policy;
    if (penalty_amount > 0) {
        wallet_data = {
            wallet_type: req.body.subject_type,
            wallet_desc: 'For Reschedule of lesson',
            wallet_user: {
                role: 'learners',
                user: ObjectId(req.body.student_id)
            },
            debit_amount: penalty_amount,
            booking_id: booking_id,
            wallet_status: 'paid'
        };

        payment_log = {
            "payment_status": 'completed',
            "payment_type": 'refund_rs',
            "payment_desc": 'Lesson',
            "payment_to": {
                role: 'tutors',
                user: ObjectId(req.body.tutor_id._id)
            },
            "payment_from": {
                role: 'learners',
                user: ObjectId(req.body.student_id)
            },
            payment_amount: penalty_amount,
            booking_id: booking_id,
            lesson_id: lesson_id,
            isAdminReceived: true
        };
    }


    var response = {};

    async.waterfall([
        function (callback) { // checks whether there is an event already there or not for Learner
            conditions = {
                student_id: ObjectId(req.body.student_id),
                start: {
                    $gte: moment(req.body.start).startOf('week').toISOString(),
                    $lt: moment(req.body.start).endOf('week').toISOString()
                },
                isDeleted: false,
                enable: true
            };

            scheduleObj.find(conditions)
                    .lean()
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            //var events = data;
                            var events = _.reject(data, {"_id": ObjectId(req.body._id)});

                            _.forEach(events, function (key) {
                                var startEvent = moment(key.start);
                                var endEvent = moment(key.end);
                                // checks if event does not conflict previous events        
                                if (Math.round(startEvent) / 1000 < Math.round(checkEndDate) / 1000 && Math.round(endEvent) > Math.round(checkStartDate)) {
                                    checkEvent.push(true);
                                }
                            });
                            if (checkEvent.length > 0) {
                                err = 'You are having another event for the selected time';
                                return callback(err);
                            } else {
                                callback(null, checkEvent);
                            }
                        }
                    });
        },
        function (event, callback) { // checks whether there is an event already there or not for tutor
            conditions = {
                tutor_id: ObjectId(req.body.tutor_id._id),
                start: {
                    $gte: moment(req.body.start).startOf('week').toISOString(),
                    $lt: moment(req.body.start).endOf('week').toISOString()
                },
                isDeleted: false
            };

            scheduleObj.find(conditions)
                    .lean()
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            //var events = data;
                            var events = _.reject(data, {"_id": ObjectId(req.body._id)});

                            _.forEach(events, function (key) {
                                var startEvent = moment(key.start);
                                var endEvent = moment(key.end);
                                // checks if event does not conflict previous events        
                                if (Math.round(startEvent) / 1000 < Math.round(checkEndDate) / 1000 && Math.round(endEvent) > Math.round(checkStartDate)) {
                                    checkEvent.push(true);
                                }
                            });
                            if (checkEvent.length > 0) {
                                err = 'Tutor is having another event for the selected time';
                                return callback(err);
                            } else {
                                callback(null, checkEvent);
                            }
                        }
                    });
        },
        function (event, callback) {
            if (token && penalty_amount > 0) {
                var price = penalty_amount * 100; // converting the amount into cents
                //var stripe_fees = parseInt(booking_price * 0.014 * 0.9 + 0.25);
                stripe.customers.create({
                    email: token.email,
                    source: token.id
                }).then(function (customer) {
                    return stripe.charges.create({
                        amount: price,
                        currency: constantObj.stripeCredentials.currency,
                        customer: customer.id
                    });
                }).then(function (charge) {
                    stripe_data = {
                        charge_id: charge.id,
                        amount: charge.amount,
                        application_fee: charge.application_fee,
                        customer: charge.customer,
                        captured: charge.captured,
                        currency: charge.currency,
                        created: charge.created,
                        balance_transaction: charge.balance_transaction
                    };
                    return stripe.balance.retrieveTransaction(
                            charge.balance_transaction
                            );
                }).then(function (balance) {
                    stripe_data.description = balance.description;
                    stripe_data.available_on = balance.available_on;
                    stripe_data.fee_details = balance.fee_details;
                    stripe_data.net = balance.net;
                    callback(null, stripe_data);
                }).catch(function (err) {
                    console.log(err);
                    return callback(err);
                });
            } else {
                callback(null, {});
            }
        },
        function (stripe, callback) { // updates the schedule collection

            reschedule_info = {
                refund_policy: reschedule_policy.refundPolicy,
                reschedule_by: 'learner',
                start: req.body.start,
                end: req.body.end,
                penalty_amount: penalty_amount, // penalty charges in case of rescheduling
                reschedule_date: moment().toISOString(),
                isVerified: false
            };

            scheduleObj.findOneAndUpdate(updateConditions, {$set: {reschedule_info: reschedule_info, schedule_status: 'rescheduled'}}, {new : true})
                    .populate([
                        {path: 'student_id', select: 'personalInfo email currTimeOffset deviceId '},
                        {path: 'subject_id', select: 'name'},
                        {path: 'tutor_id', select: 'personalInfo email currTimeOffset deviceId '},
                        {path: 'booking_id', select: 'booking_ref'}
                    ])
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            callback(null, data, stripe);
                        }
                    });
        },
        function (rescheduleEvent, stripe, callback) { // insert the payment log
            if (token && penalty_amount > 0) {
                // extending the stripe data to payment log
                payment_log.stripe_data = stripe;
                paymentlogObj(payment_log).save(function (err) {
                    if (err) {
                        return callback(err);
                    } else {
                        callback(null, rescheduleEvent);
                    }
                });
            } else {
                callback(null, rescheduleEvent);
            }
        },
        function (rescheduleEvent, callback) { // insert the wallet data
            if (token && penalty_amount > 0) {
                var receipt_no = biguint(crypto.randomBytes(4), 'dec', {groupsize: 5, delimiter: '-'});
                wallet_data = _.extend({}, wallet_data, {
                    reference_no: rescheduleEvent.booking_id.booking_ref,
                    receipt_no: receipt_no
                });

                walletObj(wallet_data).save(function (err) {
                    if (err) {
                        return callback(err);
                    } else {
                        callback(null, rescheduleEvent);
                    }
                });
            } else {
                callback(null, rescheduleEvent);
            }
        },
        function (rescheduleEvent, callback) { // email notifications
            var t_offset = (rescheduleEvent.tutor_id.currTimeOffset) ? rescheduleEvent.tutor_id.currTimeOffset : '+0000';
            var lname = (rescheduleEvent.student_id.personalInfo.firstName) ? rescheduleEvent.student_id.personalInfo.firstName : 'Learner';
            var tname = (rescheduleEvent.tutor_id.personalInfo.firstName) ? rescheduleEvent.tutor_id.personalInfo.firstName : 'Tutor';

            templateData = {
                emailTo: rescheduleEvent.tutor_id.email,
                emailToName: tname,
                requestby: lname,
                subject_name: rescheduleEvent.subject_id.name,
                previous_time: moment(rescheduleEvent.start).utcOffset(t_offset).format('Do MMMM YYYY, h:mma') + ' to ' + moment(rescheduleEvent.end).utcOffset(t_offset).format('h:mma'),
                new_time: moment(req.body.start).utcOffset(t_offset).format('Do MMMM YYYY, h:mma') + ' to ' + moment(req.body.end).utcOffset(t_offset).format('h:mma')
            };
            // A notification email will be sent for Reschedule
            emailServiceObj.sendRescheduleLessonRequest(templateData);

            // Push notification for Reschedule Request
            if (rescheduleEvent.tutor_id && rescheduleEvent.tutor_id.deviceId) {
                pushData = {
                    title: 'Reschedule Lesson Request',
                    body: lname + ' has requested a reschedule request for ' + rescheduleEvent.subject_id.name,
                    jsonobj: jsonobj
                };

                userObj = {
                    senderId: '',
                    senderType: '',
                    receiverId: rescheduleEvent.tutor_id._id,
                    receiverType: 'tutors'
                };
                pushNoti.sendPushNotificationByUserId(userObj, pushData);
            }

            // Activity Template
            activity = {slug: 'reschedule-learner-request', user_id: rescheduleEvent.tutor_id._id, role: 'tutors'};
            activitytemplate = {LNAME: lname, SUBJECTNAME: rescheduleEvent.subject_id.name};
            activityObj.triggerActivity(activity, activitytemplate);

            callback(null, rescheduleEvent);
        }
    ], function (err, result) {
        if (err) {
            response = {status: 201, message: err};
            res.jsonp(response);
        } else {
            if (!_.isEmpty(result)) {
                response = {status: 200, message: "Event updated successfully"};
                res.jsonp(response);
            } else {
                response = {status: 201, message: "Event not updated successfully"};
                res.jsonp(response);
            }
        }
    });
}

/*
 * this function will be called when request for Reschedule has been initiated from tutor end
 */
function requestForRescheduleAtTutor(req, res) {
    var conditions = {};
    var reschedule_info = {};
    var templateData = {};

    var updateConditions = {
        _id: ObjectId(req.body._id)
    };

    var booking_id = req.body.booking_id;
    var lesson_id = req.body.lesson_id;

    var penalty_amount = req.body.penalty_amount; //converting to actual value    
    //title : req.body.title,
    //description : req.body.description,
    var wallet_data = {};
    var payment_log = {};

    var checkEvent = [];
    var checkStartDate = moment(req.body.start);
    var checkEndDate = moment(req.body.end);
    var templateData = {};
    var reschedule_policy = req.body.resechedule_policy;
    var pushData = {};
    var userObj = {};
    var activity = {};
    var activitytemplate = {};

    if (penalty_amount > 0) {
        wallet_data = {
            wallet_type: req.body.subject_type,
            wallet_desc: 'For Reschedule of lesson',
            wallet_user: {
                role: 'tutors',
                user: ObjectId(req.body.tutor_id)
            },
            debit_amount: penalty_amount,
            booking_id: booking_id,
            wallet_status: 'pending'
        };

        payment_log = {
            "payment_status": 'pending',
            "payment_type": 'refund_rs',
            "payment_desc": 'Lesson',
            "payment_to": {
                role: 'learners',
                user: ObjectId(req.body.student_id)
            },
            "payment_from": {
                role: 'tutors',
                user: ObjectId(req.body.tutor_id)
            },
            payment_amount: penalty_amount,
            booking_id: booking_id,
            lesson_id: lesson_id,
            isAdminReceived: false
        };
    }

    var response = {};

    async.waterfall([
        function (callback) { // checks whether there is an event already there or not for the tutor
            conditions = {
                tutor_id: ObjectId(req.body.tutor_id),
                start: {
                    $gte: moment(req.body.start).startOf('week').toISOString(),
                    $lt: moment(req.body.start).endOf('week').toISOString()
                },
                isDeleted: false,
                enable: true
            };

            scheduleObj.find(conditions)
                    .lean()
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            //var events = data;
                            var events = _.reject(data, {"_id": ObjectId(req.body._id)});
                            _.forEach(events, function (key) {
                                var startEvent = moment(key.start);
                                var endEvent = moment(key.end);
                                // checks if event does not conflict previous events        
                                if (Math.round(startEvent) / 1000 < Math.round(checkEndDate) / 1000 && Math.round(endEvent) > Math.round(checkStartDate)) {
                                    checkEvent.push(true);
                                }
                            });
                            if (checkEvent.length > 0) {
                                err = 'You are having another event for the selected time';
                                return callback(err);
                            } else {
                                callback(null, checkEvent);
                            }
                        }
                    });
        },
        function (event, callback) { // checks whether there is an event already there or not for the learner
            conditions = {
                student_id: ObjectId(req.body.student_id),
                start: {
                    $gte: moment(req.body.start).startOf('week').toISOString(),
                    $lt: moment(req.body.start).endOf('week').toISOString()
                },
                isDeleted: false
            };

            scheduleObj.find(conditions)
                    .lean()
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            //var events = data;
                            var events = _.reject(data, {"_id": ObjectId(req.body._id)});
                            _.forEach(events, function (key) {
                                var startEvent = moment(key.start);
                                var endEvent = moment(key.end);
                                // checks if event does not conflict previous events        
                                if (Math.round(startEvent) / 1000 < Math.round(checkEndDate) / 1000 && Math.round(endEvent) > Math.round(checkStartDate)) {
                                    checkEvent.push(true);
                                }
                            });
                            if (checkEvent.length > 0) {
                                err = 'Learner is having another event for the selected time';
                                return callback(err);
                            } else {
                                callback(null, checkEvent);
                            }
                        }
                    });
        },
        function (details, callback) { // updates the schedule collection

            reschedule_info = {
                refund_policy: reschedule_policy.refundPolicy,
                reschedule_by: 'tutor',
                start: req.body.start,
                end: req.body.end,
                penalty_amount: penalty_amount, // penalty charges in case of rescheduling
                reschedule_date: moment().toISOString(),
                isVerified: false
            };

            scheduleObj.findOneAndUpdate(updateConditions, {$set: {reschedule_info: reschedule_info, schedule_status: 'rescheduled'}}, {new : true})
                    .populate([
                        {path: 'student_id', select: 'personalInfo email currTimeOffset deviceId '},
                        {path: 'subject_id', select: 'name'},
                        {path: 'tutor_id', select: 'personalInfo email currTimeOffset deviceId '},
                        {path: 'booking_id', select: 'booking_ref'}
                    ])
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            callback(null, data);
                        }
                    });
        },
        function (rescheduleEvent, callback) { // insert the payment log
            if (penalty_amount > 0) {
                paymentlogObj(payment_log).save(function (err) {
                    if (err) {
                        return callback(err);
                    } else {
                        callback(null, rescheduleEvent);
                    }
                });
            } else {
                callback(null, rescheduleEvent);
            }
        },
        function (rescheduleEvent, callback) { // insert the wallet data
            if (penalty_amount > 0) {
                var receipt_no = biguint(crypto.randomBytes(4), 'dec', {groupsize: 5, delimiter: '-'});
                wallet_data = _.extend({}, wallet_data, {
                    reference_no: rescheduleEvent.booking_id.booking_ref,
                    receipt_no: receipt_no
                });

                walletObj(wallet_data).save(function (err) {
                    if (err) {
                        return callback(err);
                    } else {
                        callback(null, rescheduleEvent);
                    }
                });
            } else {
                callback(null, rescheduleEvent);
            }
        },
        function (rescheduleEvent, callback) { // insert the log for reschedule
            // A Notification Email will be sent for Reschedule
            var l_offset = (rescheduleEvent.student_id.currTimeOffset) ? rescheduleEvent.student_id.currTimeOffset : '+0000';
            var lname = (rescheduleEvent.student_id.personalInfo.firstName) ? rescheduleEvent.student_id.personalInfo.firstName : 'Learner';
            var tname = (rescheduleEvent.tutor_id.personalInfo.firstName) ? rescheduleEvent.tutor_id.personalInfo.firstName : 'Tutor';

            templateData = {
                emailTo: rescheduleEvent.student_id.email,
                emailToName: lname,
                requestby: tname,
                subject_name: rescheduleEvent.subject_id.name,
                previous_time: moment(rescheduleEvent.start).utcOffset(l_offset).format('Do MMMM YYYY, h:mma') + ' to ' + moment(rescheduleEvent.end).utcOffset(l_offset).format('h:mma'),
                new_time: moment(req.body.start).utcOffset(l_offset).format('Do MMMM YYYY, h:mma') + ' to ' + moment(req.body.end).utcOffset(l_offset).format('h:mma')
            };

            emailServiceObj.sendRescheduleLessonRequest(templateData);

            // Push notification for Reschedule Request
            if (rescheduleEvent.student_id && rescheduleEvent.student_id.deviceId) {
                var jsonobj = {noti_section: 'lesson_notification', noti_data: {}};

                pushData = {
                    title: 'Reschedule Lesson Request',
                    body: tname + ' has requested a reschedule request for ' + rescheduleEvent.subject_id.name,
                    jsonobj: jsonobj
                };

                userObj = {
                    senderId: '',
                    senderType: '',
                    receiverId: rescheduleEvent.student_id._id,
                    receiverType: 'learners'
                };
                pushNoti.sendPushNotificationByUserId(userObj, pushData);
            }

            // Activity Template
            activity = {slug: 'reschedule-tutor-request', user_id: rescheduleEvent.student_id._id, role: 'learners'};
            activitytemplate = {TNAME: tname, SUBJECTNAME: rescheduleEvent.subject_id.name};
            activityObj.triggerActivity(activity, activitytemplate);

            callback(null, rescheduleEvent);
        }
    ], function (err, result) {
        if (err) {
            response = {status: 201, message: err};
            res.jsonp(response);
        } else {
            if (!_.isEmpty(result)) {
                response = {status: 200, message: "Event updated successfully"};
                res.jsonp(response);
            } else {
                response = {status: 201, message: "Event not updated successfully"};
                res.jsonp(response);
            }
        }
    });
}

/*
 * this function will be called when Interview is Accepted or Declined at Learner's end
 */
function updateInterview(req, res) {
    var conditions = {"_id": req.body._id};
    var interview = req.body.interviewschedule;
    var status = interview.is_tutor_accepted;
    var activity1 = {};
    var activitytemplate1 = {};
    var activity2 = {};
    var activitytemplate2 = {};

    if (status === 'Accepted') {

        bookingObj.findOneAndUpdate(conditions, {$set: {interviewschedule: interview}}, {new : true})
                .populate([
                    {path: 'student_id', select: 'personalInfo'},
                    {path: 'tutor_id', select: 'personalInfo'}
                ])
                .lean()
                .exec(function (err, data) {
                    if (err) {
                        response = {status: 201, message: "Record was not updated successfully"};
                    } else {
                        var tutorid = data.tutor_id;
                        var learnerid = data.student_id;

                        // Learner's 
                        activity1 = {slug: 'accept-tutor', user_id: learnerid, role: 'learners'};
                        activitytemplate1 = {TNAME: data.tutor_id.personalInfo.firstName};
                        // Tutor's
                        activity2 = {slug: 'learner-accept-tutor', user_id: tutorid, role: 'tutors'};
                        activitytemplate2 = {LNAME: data.student_id.personalInfo.firstName};

                        // triggers activity in case of Interview Acceptance and Decline
                        activityObj.triggerActivity(activity1, activitytemplate1);
                        activityObj.triggerActivity(activity2, activitytemplate2);

                        response = {status: 200, message: "Record was updated successfully"};
                    }
                    res.jsonp(response);
                });
    } else if (status === 'Declined') {

        var cancellation_info = {
            cancellation_status: 'Waiting for LA',
            cancelled_by: 'learner',
            cancellation_reason: 'Learner declined the Interview with Tutor',
            cancellation_from: 'Pending'
        };
        var fields = {interviewschedule: interview, current_booking_status: 'Cancelled', cancellation_info: cancellation_info};

        async.waterfall([
            function (callback) { // updates the booking collection
                bookingObj.findOneAndUpdate(conditions, {$set: fields}, {new : true})
                        .populate([
                            {path: 'student_id', select: 'personalInfo'},
                            {path: 'tutor_id', select: 'personalInfo'}
                        ])
                        .lean()
                        .exec(function (err, data) {
                            if (err) {
                                response = {status: 201, message: "Record was not updated successfully"};
                            } else {
                                callback(null, data);
                            }
                        });
            },
            function (bookingData, callback) { // updates the Schedule collection
                conditions = {
                    booking_id: ObjectId(req.body._id)
                };
                fields = {
                    $set: {
                        enable: false,
                        schedule_status: 'cancelled'
                    }
                };

                scheduleObj.update(conditions, fields, {multi: true}) // multiple updates
                        .exec(function (err) {
                            if (err) {
                                // 
                            } else {
                                callback(null, bookingData);
                            }
                        });
            },
            function (bookingData, callback) { // Alert Notifications & Email Activities

                activity1 = {slug: 'decline-tutor', user_id: bookingData.student_id._id, role: 'learners'};
                activitytemplate1 = {TNAME: bookingData.tutor_id.personalInfo.firstName};
                // Tutor's
                activity2 = {slug: 'learner-decline-tutor', user_id: bookingData.tutor_id._id, role: 'tutors'};
                activitytemplate2 = {LNAME: bookingData.student_id.personalInfo.firstName};
                // triggers activity in case of Interview Acceptance and Decline
                activityObj.triggerActivity(activity1, activitytemplate1);
                activityObj.triggerActivity(activity2, activitytemplate2);

                callback(null, true);

            }
        ], function (err, result) {
            if (err) {
                response = {status: 201, message: "Record was not updated successfully"};
            } else {
                response = {status: 200, message: "Record was updated successfully"};
            }
            res.jsonp(response);
        });
    }
}

function updateBookingPayment(req, res) {
    // Stripe Object
    var stripeCredentials = process.LaSec['stripe-credentials'];
    var stripe = require('stripe')(stripeCredentials.stripe_secret_key);

    var token = req.body.token;
    var bookingId = ObjectId(req.body._id);
    var walletData = {};
    var paymentlogData = [];
    var stripe_data = {};
    var activity = {};
    var activitytemplate = {};
    var learnertemplate = {};
    var tutortemplate = {};
    var paymentInfo = req.body.payment_info;
    var bookingInfo = req.body.booking_info;
    var bookingtemplateData1 = []; // Tutor 
    var bookingtemplateData2 = []; // Learner
    // update payment status
    paymentInfo.payment_status = 'Paid';


    var conditions = {_id: bookingId};

    if (bookingInfo) {
        var index = 1;
        _.forEach(bookingInfo, function (v) {
            // Payment Log
            paymentlogData.push({
                booking_id: bookingId,
                lesson_id: ObjectId(v._id),
                payment_status: 'pending',
                payment_type: 'booking',
                payment_desc: 'Lesson (#' + index + ')',
                payment_to: {
                    role: 'tutors',
                    user: ObjectId(req.body.tutor_id._id)
                },
                payment_from: {
                    role: 'learners',
                    user: ObjectId(req.body.student_id._id)
                },
                payment_amount: v.lesson_price,
                isAdminReceived: true
            });

//            bookingtemplateData.push({
//                "lessonname": "Lesson " + index,
//                "duration": v.lesson_duration + "hr",
//                "lessontime": moment(v.start).format("DD/MM/YYYY hh:mm A"),
//                "price": "$" + v.lesson_price,
//                "subtotal": "$" + v.lesson_price
//            });

            index++;
        });
        // Wallet Data
        walletData = {
            booking_id: bookingId,
            wallet_type: req.body.subject_id.type,
            wallet_desc: 'For booking of ' + req.body.no_of_lessons + ' lesson packages',
            wallet_user: {
                role: 'learners',
                user: ObjectId(req.body.student_id._id)
            },
            debit_amount: paymentInfo.totalbookingamount,
            wallet_status: 'paid'
        };
    }

    async.waterfall([
        function (callback) { // payment to be done
            var price = paymentInfo.totalbookingamount * 100; // converting the amount into cents
            //var stripe_fees = parseInt(booking_price * 0.014 * 0.9 + 0.25);
            stripe.customers.create({
                email: token.email,
                source: token.id
            }).then(function (customer) {
                return stripe.charges.create({
                    amount: price,
                    currency: constantObj.stripeCredentials.currency,
                    customer: customer.id
                });
            }).then(function (charge) {
                stripe_data = {
                    charge_id: charge.id,
                    amount: charge.amount,
                    application_fee: charge.application_fee,
                    customer: charge.customer,
                    captured: charge.captured,
                    currency: charge.currency,
                    created: charge.created,
                    balance_transaction: charge.balance_transaction
                };
                return stripe.balance.retrieveTransaction(
                        charge.balance_transaction
                        );
            }).then(function (balance) {
                stripe_data.description = balance.description;
                stripe_data.available_on = balance.available_on;
                stripe_data.fee_details = balance.fee_details;
                stripe_data.net = balance.net;
                callback(null, stripe_data);
            }).catch(function (err) {
                console.log(err);
                return callback(err);
            });
        },
        function (stripe, callback) { // updates stripe details in booking
            bookingObj.findOneAndUpdate(conditions, {$set: {stripe_details: stripe, payment_info: paymentInfo, current_booking_status: "Current"}}, {new : true})
                    .lean().exec(function (err, data) {
                if (err) {
                    return callback(err);
                } else {
                    callback(null, data);
                }
            });
        },
        function (booking, callback) { // insert payment logs
            paymentlogObj.create(paymentlogData, function (err) {
                if (err) {
                    return callback(err);
                } else {
                    callback(null, booking);
                }
            });
        },
        function (booking, callback) { // insert wallet logs
            var bookingId = booking._id;
            var reference = booking.booking_ref;
            var receipt_no = biguint(crypto.randomBytes(4), 'dec', {groupsize: 5, delimiter: '-'});

            walletData = _.extend({}, walletData, {
                reference_no: reference,
                receipt_no: receipt_no
            });

            walletObj(walletData).save(function (err, data) {
                if (err) {
                    return callback(err);
                } else {
                    callback(null, bookingId);
                }
            });
        },
        function (bookingId, callback) {
            bookingObj.findOne({"_id": bookingId})
                    .populate([
                        {path: 'tutor_id', select: 'personalInfo email currTimeOffset'},
                        {path: 'student_id', select: 'personalInfo email currTimeOffset'},
                        {path: 'subject_id', select: 'name'},
                        {path: 'package_id'}
                    ])
                    .lean()
                    .exec(function (err, data) {
                        if (err) {

                        } else {
                            // Learner & Tutor first and last name 
                            var l_fname = (data.student_id.personalInfo.firstName) ? (data.student_id.personalInfo.firstName) : 'Learner';
                            var l_lname = (data.student_id.personalInfo.lastName) ? (data.student_id.personalInfo.lastName) : '';
                            var t_fname = (data.tutor_id.personalInfo.firstName) ? (data.tutor_id.personalInfo.firstName) : 'Tutor';
                            var t_lname = (data.tutor_id.personalInfo.lastName) ? (data.tutor_id.personalInfo.lastName) : '';

                            var l_offset = (data.student_id.currTimeOffset) ? data.student_id.currTimeOffset : '+0000';
                            var t_offset = (data.tutor_id.currTimeOffset) ? data.tutor_id.currTimeOffset : '+0000';


                            index = 1;
                            _.forEach(bookingInfo, function (v) {

                                bookingtemplateData1.push({
                                    "lessonname": "Lesson " + index,
                                    "duration": v.lesson_duration + "hr",
                                    "lessontime": moment(v.start).utcOffset(t_offset).format("DD/MM/YYYY hh:mm A"),
                                    "price": "$" + v.lesson_price,
                                    "subtotal": "$" + v.lesson_price
                                });

                                bookingtemplateData2.push({
                                    "lessonname": "Lesson " + index,
                                    "duration": v.lesson_duration + "hr",
                                    "lessontime": moment(v.start).utcOffset(l_offset).format("DD/MM/YYYY hh:mm A"),
                                    "price": "$" + v.lesson_price,
                                    "subtotal": "$" + v.lesson_price
                                });
                                index++;
                            });


                            tutortemplate = {
                                emailTo: data.tutor_id.email,
                                emailToName: t_fname,
                                learnername: l_fname + ' ' + l_lname,
                                tutorname: t_fname + ' ' + t_lname,
                                subject_name: data.subject_id.name,
                                packagename: data.package_id.number_lesson + ' lesson package -' + data.package_id.name,
                                ref_no: data.booking_ref,
                                totalpayment: "$" + paymentInfo.totalbookingamount,
                                lessonarr: bookingtemplateData1
                            };

                            learnertemplate = {
                                emailTo: data.student_id.email,
                                emailToName: l_fname,
                                learnername: l_fname + ' ' + l_lname,
                                tutorname: t_fname + ' ' + t_lname,
                                subject_name: data.subject_id.name,
                                packagename: data.package_id.number_lesson + ' lesson package -' + data.package_id.name,
                                ref_no: data.booking_ref,
                                totalpayment: "$" + paymentInfo.totalbookingamount,
                                lessonarr: bookingtemplateData2
                            };

                            activity = {slug: 'payment-done', user_id: data.student_id._id, role: 'learners'};

                            activitytemplate = {
                                TNAME: t_fname + ' ' + t_lname,
                                NO_OF_LESSONS: req.body.no_of_lessons,
                                AMOUNT: paymentInfo.totalbookingamount
                            };

                            emailServiceObj.sendBookingDetailsMail(tutortemplate, 'tutor');
                            emailServiceObj.sendBookingDetailsMail(learnertemplate, 'learner');
                            activityObj.triggerActivity(activity, activitytemplate);
                            callback(null, 'done');
                        }
                    });
        }
    ], function (err, result) {
        if (err) {
            response = {status: 201, message: err};
            res.jsonp(response);
        } else {
            if (result === 'done') {
                response = {status: 200, message: "Payment successfully done."};
                res.jsonp(response);
            } else {
                response = {status: 201, message: "There was an error while doing payment."};
                res.jsonp(response);
            }
        }
    });
}

/*
 * @created     09/01/2017
 * @author      Amanpreet Singh
 * @desc        markInterview
 * @copyright   smartData
 */
function markInterview(input, callback) {

    var conditions = {
        _id: input.booking_id,
        "interviewschedule.is_interview_done": false
    };

    var fields = {
        "interviewschedule.is_interview_done": true,
        "interviewschedule.interview_done_date": moment().toISOString(),
        "interviewschedule.interview_updated_by": input.updated_by
    };

    var activity = {};
    var activitytemplate = {};

    bookingObj
            .findOneAndUpdate(conditions, {$set: fields}, {new : true})
            .populate([
                {path: 'student_id', select: 'email personalInfo'},
                {path: 'tutor_id', select: 'email personalInfo'}])
            .lean()
            .exec(function (err, result) {
                if (err) {
                    callback({status: 201, msg: err});
                } else {

                    if (result) {
                        var l_fname = result.student_id.personalInfo.firstName;
                        var l_lname = _.isUndefined(result.student_id.personalInfo.lastName) ? '' : result.student_id.personalInfo.lastName;
                        var t_fname = result.tutor_id.personalInfo.firstName;
                        var t_lname = _.isUndefined(result.tutor_id.personalInfo.lastName) ? '' : result.tutor_id.personalInfo.lastName;
                        var l_name = l_fname + ' ' + l_lname;
                        var t_name = t_fname + ' ' + t_lname;

                        if (input.updated_by === 'learner') {
                            activity = {slug: 'learner-video-interview-done', user_id: result.student_id._id, role: 'learners'};
                            activitytemplate = {
                                TNAME: t_name
                            };
                            activityObj.triggerActivity(activity, activitytemplate);
                        } else if (input.updated_by === 'tutor') {
                            activity = {slug: 'tutor-video-interview-done', user_id: result.tutor_id._id, role: 'tutors'};
                            activitytemplate = {
                                LNAME: l_name
                            };
                            activityObj.triggerActivity(activity, activitytemplate);
                        }


                        callback({status: 200, msg: "Interview Marked"});
                    } else {
                        callback({status: 201, msg: "Interview is already marked."});
                    }

                }
            });
}

/*
 * @created     09/01/2017
 * @author      Amanpreet Singh
 * @desc        cancelTutorBooking
 * @copyright   smartData
 */
function cancelTutorBooking(input, headers, callback) {
    var conditions = {};
    var fields = {};
    var paymentlog = [];
    var schedules = [];
    var templateData = {}; // for notifications
    var templateData1 = {};
    var activity = {}; // for recent activity
    var activitytemplate = {};
    var response = {};

    async.waterfall([
        function (callback) { // to check if there is any in completed lession and to calculate the net refund amount
            conditions = {
                _id: ObjectId(input.booking_id)
            };
            bookingObj.aggregate([
                {$match: conditions},
                {$unwind: "$booking_info"},
                {$match: {"booking_info.is_completed": false}},
                {$sort: {"booking_info.start": 1}}
            ])
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            if (data.length > 0) {
                                //check the duration 
                                var booking = _.head(data);
                                var cancellation_policy = booking.cancellation_policy;
                                var cancellation_duration = cancellation_policy.refundDuration; // in hrs
                                var cancellation_penalty = cancellation_policy.refundPenalty; // in perc
                                var bookinginfo = booking.booking_info;
                                var bookingtime = moment(bookinginfo.start);

                                var current_date = moment();
                                var duration = bookingtime.diff(current_date, 'minutes') / 60;

                                //check the net booking amount
                                var penalty_amount = 0;

                                if (duration < cancellation_duration) {
                                    _.forEach(data, function (v) {
                                        // calculates the penalty amount 
                                        penalty_amount = (cancellation_penalty * v.booking_info.lesson_price) / 100;

                                        paymentlog.push({
                                            "payment_type": "refund_can",
                                            "payment_desc": v.booking_info.activityname,
                                            "isAdminReceived": false,
                                            "booking_id": v._id,
                                            "lesson_id": v.booking_info._id,
                                            "isProcessed": false,
                                            "isDeleted": false,
                                            "payment_amount": penalty_amount,
                                            "payment_from": {
                                                "role": "learners",
                                                "user": v.student_id
                                            },
                                            "payment_to": {
                                                "role": "tutors",
                                                "user": v.tutor_id
                                            },
                                            "payment_status": "pending"
                                        });

                                        // for schedules 
                                        schedules.push({
                                            'lesson_id': v.booking_info._id
                                        });
                                    });
                                    callback(null, paymentlog, schedules);
                                } else {
                                    // In case of No Refund no payment log to be inserted
                                    callback(null, []);
                                }
                            } else {
                                err = 'All lessons are already completed';
                                return callback(err);
                            }
                        }
                    });
        },
        function (paymentlog, schedules, callback) { // inserts payment log information
            if (paymentlog.length > 0) {
                paymentlogObj.create(paymentlog, function (err) {
                    if (err) {
                        return callback(err);
                    } else {
                        callback(null, input.booking_id, schedules);
                    }
                });
            } else {
                callback(null, input.booking_id, schedules);
            }
        },
        function (booking, schedules, callback) { //updates the schedules from pending to cancelled
            if (schedules.length > 0) {
                var lessons = _.map(schedules, 'lesson_id');

                conditions = {
                    booking_id: ObjectId(booking),
                    lesson_id: {$in: lessons}
                };
                fields = {
                    $set: {
                        enable: false,
                        schedule_status: 'cancelled'
                    }
                };

                scheduleObj.update(conditions, fields, {multi: true}) // multiple updates
                        .exec(function (err) {
                            if (err) {
                                // 
                            } else {
                                callback(null, input.booking_id);
                            }
                        });
            } else {
                callback(null, input.booking_id);
            }

        },
        function (bookingid, callback) { // updates the booking status
            conditions = {
                _id: ObjectId(input.booking_id)
            };
            fields = {
                current_booking_status: 'Cancelled',
                cancellation_info: {
                    cancellation_status: 'Pending Refund',
                    cancelled_by: 'learner',
                    cancellation_reason: input.reason,
                    cancellation_from: input.from
                }
            };
            bookingObj.findOneAndUpdate(conditions, {$set: fields}, {new : true})
                    .populate([
                        {path: 'student_id', select: 'email personalInfo currTimeOffset'},
                        {path: 'subject_id'},
                        {path: 'level_id'},
                        {path: 'tutor_id', select: 'email personalInfo currTimeOffset'}
                    ])
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            callback(null, data);
                        }
                    });
        },
        function (booking, callback) { // for email notifications & recent activity
            var l_fname = (booking.student_id.personalInfo.firstName) ? (booking.student_id.personalInfo.firstName) : 'Learner';
            var t_fname = (booking.tutor_id.personalInfo.firstName) ? (booking.tutor_id.personalInfo.firstName) : 'Tutor';

            // for the learner
            templateData = {
                emailTo: booking.student_id.email,
                emailToName: l_fname,
                concern_name: t_fname,
                subject_name: booking.subject_id.name,
                level_name: booking.level_id.name,
                booking_url: headers.referer + '#!/revert-cancellation/' + booking.booking_ref
            };
            emailServiceObj.sendBookingCancellationConfirmation(templateData, 'learner');

            // for the tutor
            templateData1 = {
                emailTo: booking.tutor_id.email,
                emailToName: t_fname,
                concern_name: l_fname,
                subject_name: booking.subject_id.name,
                level_name: booking.level_id.name,
                reason: input.reason
            };
            emailServiceObj.sendOtherBookingCancellationConfirmation(templateData1, 'learner');

            // Recent Activity
            callback(null, booking);
        }
    ], function (err, result) {
        if (err) {
            response = {status: 201, message: err};
            callback(response);
        } else {
            if (!_.isEmpty(result)) {
                response = {status: 200, message: 'Tutor Cancelled', data: result};
                callback(response);
            } else {
                response = {status: 201, message: "Tutor was not cancelled"};
                callback(response);
            }
        }
    });
}

/*
 * @created     09/01/2017
 * @author      Amanpreet Singh
 * @desc        shift Tutor Booking
 * @copyright   smartData
 */
function shiftTutorBooking(input, callback) {
    var conditions = {};
    var fields = {};
    var response = {};

    async.waterfall([
        function (callback) { // updates the booking status
            conditions = {
                _id: ObjectId(input.booking_id)
            };
            fields = {
                current_booking_status: 'Current'
            };
            bookingObj.findOneAndUpdate(conditions, {$set: fields}, {new : true})
                    .populate([
                        {path: 'student_id', select: 'email personalInfo currTimeOffset'},
                        {path: 'subject_id'},
                        {path: 'level_id'},
                        {path: 'tutor_id', select: 'email personalInfo currTimeOffset'}
                    ])
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            callback(null, data);
                        }
                    });
        },
        function (booking, callback) { // for email notifications & recent activity
//            var l_fname = (booking.student_id.personalInfo.firstName) ? (booking.student_id.personalInfo.firstName) : 'Learner';
//            var t_fname = (booking.tutor_id.personalInfo.firstName) ? (booking.tutor_id.personalInfo.firstName) : 'Tutor';

            // for the learner
//            templateData = {
//                emailTo: booking.student_id.email,
//                emailToName: l_fname,
//                concern_name: t_fname,
//                subject_name: booking.subject_id.name,
//                level_name: booking.level_id.name,
//                booking_url : headers.referer + '#!/revert-cancellation/'+booking.booking_ref
//            };
//            emailServiceObj.sendBookingCancellationConfirmation(templateData,'learner');

            // Recent Activity
            callback(null, booking);
        }
    ], function (err, result) {
        if (err) {
            response = {status: 201, message: err};
            callback(response);
        } else {
            if (!_.isEmpty(result)) {
                response = {status: 200, message: 'Learner shifted to Current', data: result};
                callback(response);
            } else {
                response = {status: 201, message: "Learner was not shifted"};
                callback(response);
            }
        }
    });
}

function getBookingInfo(req, res) {
    var fields = {};
    var conditions = {
        _id: req.params.id
    };

    bookingObj.findOne(conditions, fields)
            .populate([
                {path: 'student_id'},
                {path: 'tutor_id'},
                {path: 'subject_id'},
                {path: 'level_id'}
            ])
            .exec(function (err, data) {
                if (err) {
                    res.jsonp({status: 201, msg: err});
                } else {
                    if (_.isNull(data)) {
                        res.jsonp({status: 201, msg: "booking Info."});
                    } else {
                        res.jsonp({status: 200, msg: "booking Info.", data: data});
                    }
                }
            });

}

/*
 * @created     09/01/2017
 * @author      Amanpreet Singh
 * @desc        cancelLearnerBooking
 * @copyright   smartData
 */
function cancelLearnerBooking(input, headers, callback) {
    var conditions = {};
    var fields = {};
    var paymentlog = [];
    var schedules = [];
    var templateData = {}; // for notifications
    var templateData1 = {};
    var activity = {}; // for recent activity
    var activitytemplate = {};
    var response = {};

    async.waterfall([
        function (callback) { // to check if there is any in completed lession and to calculate the net refund amount
            conditions = {
                _id: ObjectId(input.booking_id)
            };
            bookingObj.aggregate([
                {$match: conditions},
                {$unwind: "$booking_info"},
                {$match: {"booking_info.is_completed": false}},
                {$sort: {"booking_info.start": 1}}
            ])
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            if (data.length > 0) {
                                //check the duration 
                                var booking = _.head(data);
                                var cancellation_policy = booking.cancellation_policy;
                                var cancellation_duration = cancellation_policy.refundDuration; // in hrs
                                var cancellation_penalty = cancellation_policy.refundPenalty; // in perc
                                var bookinginfo = booking.booking_info;
                                var bookingtime = moment(bookinginfo.start);

                                var current_date = moment();
                                var duration = bookingtime.diff(current_date, 'minutes') / 60;

                                //check the net booking amount
                                var penalty_amount = 0;

                                if (duration < cancellation_duration) {
                                    _.forEach(data, function (v) {
                                        // calculates the penalty amount 
                                        penalty_amount = (cancellation_penalty * v.booking_info.lesson_price) / 100;

                                        paymentlog.push({
                                            "payment_type": "refund_can",
                                            "payment_desc": v.booking_info.activityname,
                                            "isAdminReceived": false,
                                            "booking_id": v._id,
                                            "lesson_id": v.booking_info._id,
                                            "isProcessed": false,
                                            "isDeleted": false,
                                            "payment_amount": penalty_amount,
                                            "payment_from": {
                                                "role": "tutors",
                                                "user": v.tutor_id
                                            },
                                            "payment_to": {
                                                "role": "learners",
                                                "user": v.student_id
                                            },
                                            "payment_status": "pending"
                                        });

                                        // for schedules 
                                        schedules.push({
                                            'lesson_id': v.booking_info._id
                                        });
                                    });
                                    callback(null, paymentlog, schedules);
                                } else {
                                    // In case of No Refund no payment log to be inserted
                                    callback(null, []);
                                }
                            } else {
                                err = 'All lessons are already completed';
                                return callback(err);
                            }
                        }
                    });
        },
        function (paymentlog, schedules, callback) { // inserts payment log information
            if (paymentlog.length > 0) {
                paymentlogObj.create(paymentlog, function (err) {
                    if (err) {
                        return callback(err);
                    } else {
                        callback(null, input.booking_id, schedules);
                    }
                });
            } else {
                callback(null, input.booking_id, schedules);
            }
        },
        function (booking, schedules, callback) { //updates the schedules from pending to cancelled
            if (schedules.length > 0) {
                var lessons = _.map(schedules, 'lesson_id');

                conditions = {
                    booking_id: ObjectId(booking),
                    lesson_id: {$in: lessons}
                };
                fields = {
                    $set: {
                        enable: false,
                        schedule_status: 'cancelled'
                    }
                };

                scheduleObj.update(conditions, fields, {multi: true}) // multiple updates
                        .exec(function (err) {
                            if (err) {
                                // 
                            } else {
                                callback(null, input.booking_id);
                            }
                        });
            } else {
                callback(null, input.booking_id);
            }

        },
        function (bookingid, callback) { // updates the booking status
            conditions = {
                _id: ObjectId(input.booking_id)
            };
            fields = {
                current_booking_status: 'Cancelled',
                cancellation_info: {
                    cancellation_status: 'Pending Refund',
                    cancelled_by: 'tutor',
                    cancellation_reason: input.reason,
                    cancellation_from: input.from
                }
            };
            bookingObj.findOneAndUpdate(conditions, {$set: fields}, {new : true})
                    .populate([
                        {path: 'student_id', select: 'email personalInfo'},
                        {path: 'subject_id'},
                        {path: 'level_id'},
                        {path: 'tutor_id', select: 'email personalInfo'}
                    ])
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            callback(null, data);
                        }
                    });
        },
        function (booking, callback) { // for email notifications & recent activity
            var l_fname = (booking.student_id.personalInfo.firstName) ? (booking.student_id.personalInfo.firstName) : 'Learner';
            var t_fname = (booking.tutor_id.personalInfo.firstName) ? (booking.tutor_id.personalInfo.firstName) : 'Tutor';
            // for tutor
            templateData = {
                emailTo: booking.tutor_id.email,
                emailToName: t_fname,
                concern_name: l_fname,
                subject_name: booking.subject_id.name,
                level_name: booking.level_id.name,
                booking_url: headers.referer + '#!/revert-cancellation/' + booking.booking_ref
            };
            emailServiceObj.sendBookingCancellationConfirmation(templateData, 'tutor');

            // for learner
            templateData1 = {
                emailTo: booking.student_id.email,
                emailToName: l_fname,
                concern_name: t_fname,
                subject_name: booking.subject_id.name,
                level_name: booking.level_id.name,
                reason: input.reason
            };
            emailServiceObj.sendOtherBookingCancellationConfirmation(templateData1, 'tutor');

            // Recent Activity

            callback(null, booking);
        }
    ], function (err, result) {
        if (err) {
            response = {status: 201, message: err};
            callback(response);
        } else {
            if (!_.isEmpty(result)) {
                response = {status: 200, message: 'Learner Cancelled', data: result};
                callback(response);
            } else {
                response = {status: 201, message: "Learner was not cancelled"};
                callback(response);
            }
        }
    });
}
//retrun ids of linked child accounts along with requester id
function fetchMeAndMyLinkIds(stuId, callback) {
    var linkedAccounts = [];
    //linkedIds = linkedIds.push(stuId);
    var conditions = {_id: stuId};
    var fields = {linkedAccounts: 1};
    learnerObj.findOne(conditions, fields)
            .exec(function (err, data) {
                if (data) {
                    linkedAccounts = _.map(_.filter(data.linkedAccounts, {relation_type: 'child'}), 'linked_id');
                }
                linkedAccounts.push(ObjectId(stuId));
                callback(null, linkedAccounts);
            });
}

/*
 * @created     5/05/2017
 * @author      Amanpreet Singh
 * @desc        getOverduesLesson
 * @usage       Mobile
 * @copyright   smartData
 */
function getOverduesLessons(req, res) {
    var type = req.body.type; // to check learner or tutor
    var conditions = {};
    var end = moment().startOf('day').toISOString();
    var pendingApproval = (req.body.pendingApproval) ? req.body.pendingApproval : false; //if only pending lessons which require approval

    if (type === 'tutors') {
        conditions = {
            "tutor_id": ObjectId(req.body.tutor_id),
            "payment_info.payment_status": 'Paid',
            "isDeleted": false
        };

        bookingObj
                .aggregate([
                    {$match: conditions},
                    {$unwind: "$booking_info"},
                    {$match: {"booking_info.is_completed": false, "booking_info.end": {$lt: new Date(end)}}},
                    {$project: {"_id": 1, "tutor_id": 1, "student_id": 1, "level_id": 1, "subject_id": 1, "package_id": 1, "booking_info": 1}}
                ])
                .sort({"booking_info.end": 1})
                .exec(function (err, details) {
                    // populate the data after 
                    var options = [
                        {path: 'tutor_id', model: 'tutors', select: 'personalInfo currentlyActive lastSeen'},
                        {path: 'student_id', model: 'learners', select: 'personalInfo currentlyActive lastSeen'},
                        {path: 'subject_id', model: 'subjects', select: 'name type'},
                        {path: 'level_id', model: 'levels', select: 'name'}
                    ];

                    bookingObj.populate(details, options, function (err, data) {
                        if (err) {
                            res.jsonp({status: 201, msg: err});
                        } else {
                            res.jsonp({status: 200, msg: "", data: data});
                        }
                    });

                });
    }

    if (type === 'learners') {
        fetchMeAndMyLinkIds(req.body.student_id, function (err, myids) {
            conditions = {
                "student_id": {$in: myids},
                "payment_info.payment_status": 'Paid',
                "isDeleted": false
            };
            if (pendingApproval) {
                bookingObj
                        .aggregate([
                            {$match: conditions},
                            {$unwind: "$booking_info"},
                            {$match: {"booking_info.is_completed": false, "booking_info.checkOutInfo.currentStatus": 'checkout', "booking_info.checkOutInfo.confirmRequired": true, "booking_info.checkOutInfo.confirmCheckout": false, "booking_info.checkOutInfo.checkoutDateTime": {$exists: true}}},
                            {$project: {"_id": 1, "tutor_id": 1, "student_id": 1, "level_id": 1, "subject_id": 1, "package_id": 1, "booking_info": 1}}
                        ])
                        .sort({"booking_info.end": 1})
                        .exec(function (err, details) {
                            // populate the data after 
                            var options = [
                                {path: 'tutor_id', model: 'tutors', select: 'personalInfo currentlyActive lastSeen'},
                                {path: 'student_id', model: 'learners', select: 'personalInfo currentlyActive lastSeen'},
                                {path: 'subject_id', model: 'subjects', select: 'name type'},
                                {path: 'level_id', model: 'levels', select: 'name'}
                            ];

                            bookingObj.populate(details, options, function (err, data) {
                                if (err) {
                                    res.jsonp({status: 201, msg: err});
                                } else {
                                    res.jsonp({status: 200, msg: "", data: data});
                                }
                            });

                        });
            } else {

                bookingObj
                        .aggregate([
                            {$match: conditions},
                            {$unwind: "$booking_info"},
                            {$match: {"booking_info.is_completed": false, "booking_info.end": {$lt: new Date(end)}}},
                            {$project: {"_id": 1, "tutor_id": 1, "student_id": 1, "level_id": 1, "subject_id": 1, "package_id": 1, "booking_info": 1}}
                        ])
                        .sort({"booking_info.end": 1})
                        .exec(function (err, details) {
                            // populate the data after 
                            var options = [
                                {path: 'tutor_id', model: 'tutors', select: 'personalInfo currentlyActive lastSeen'},
                                {path: 'student_id', model: 'learners', select: 'personalInfo currentlyActive lastSeen'},
                                {path: 'subject_id', model: 'subjects', select: 'name type'},
                                {path: 'level_id', model: 'levels', select: 'name'}
                            ];

                            bookingObj.populate(details, options, function (err, data) {
                                if (err) {
                                    res.jsonp({status: 201, msg: err});
                                } else {
                                    res.jsonp({status: 200, msg: "", data: data});
                                }
                            });

                        });
            }
        });
    }

}


/*
 * @created     8/05/2017
 * @author      Amanpreet Singh
 * @desc        getAppUpcomingEvents
 * @usage       Mobile
 * @copyright   smartData
 */
function getAppUpcomingEvents(req, res) {
    var type = req.body.type; // to check learner or tutor
    var conditions = {};
    var otherconditions = {};
    var start = moment().startOf('day').toISOString();
    var end = moment().endOf('day').toISOString();
    var isToday = req.body.isToday;
    var startDate = moment(req.body.startdate).toISOString();
    var endDate = moment(req.body.enddate).toISOString();

    if (type === 'tutors') {
        conditions = {
            "tutor_id": ObjectId(req.body.tutor_id),
            "payment_info.payment_status": 'Paid',
            "isDeleted": false
        };

        if (isToday === true) {
            otherconditions = {
                "booking_info.is_completed": false,
                "booking_info.start": {$gte: new Date(start), $lte: new Date(end)
                }
            };
        } else {
            otherconditions = {"booking_info.is_completed": false, "booking_info.start": {$gte: new Date(start)}};
        }

        if (!_.isUndefined(req.body.startdate) && !_.isUndefined(req.body.enddate)) {
            otherconditions = {"booking_info.is_completed": false, "booking_info.start": {$gte: new Date(startDate), $lte: new Date(endDate)}};
        }

        bookingObj
                .aggregate([
                    {$match: conditions},
                    {$unwind: "$booking_info"},
                    {$match: otherconditions},
                    {$project: {"_id": 1, "tutor_id": 1, "student_id": 1, "level_id": 1, "subject_id": 1, "package_id": 1, "booking_info": 1, "location": 1}}
                ])
                .sort({"booking_info.end": 1})
                .exec(function (err, details) {
                    // populate the data after 
                    var options = [
                        {path: 'tutor_id', model: 'tutors', select: 'personalInfo currentlyActive lastSeen'},
                        {path: 'student_id', model: 'learners', select: 'personalInfo currentlyActive lastSeen'},
                        {path: 'subject_id', model: 'subjects', select: 'name type'},
                        {path: 'level_id', model: 'levels', select: 'name'}
                    ];

                    bookingObj.populate(details, options, function (err, data) {
                        if (err) {
                            res.jsonp({status: 201, msg: err});
                        } else {
                            res.jsonp({status: 200, msg: "", data: data});
                        }
                    });

                });
    }

    if (type === 'learners') {

        fetchMeAndMyLinkIds(req.body.student_id, function (err, myids) {
            conditions = {
                "student_id": {$in: myids},
                "payment_info.payment_status": 'Paid',
                "isDeleted": false
            };

            if (isToday === true) {
                otherconditions = {"booking_info.is_completed": false, "booking_info.start": {$gte: new Date(start), $lte: new Date(end)}};
            } else {
                otherconditions = {"booking_info.is_completed": false, "booking_info.start": {$gte: new Date(start)}};
            }

            if (!_.isUndefined(req.body.startdate) && !_.isUndefined(req.body.enddate)) {
                otherconditions = {"booking_info.is_completed": false, "booking_info.start": {$gte: new Date(startDate), $lte: new Date(endDate)}};
            }

            bookingObj
                    .aggregate([
                        {$match: conditions},
                        {$unwind: "$booking_info"},
                        {$match: otherconditions},
                        {$project: {"_id": 1, "tutor_id": 1, "student_id": 1, "level_id": 1, "subject_id": 1, "package_id": 1, "booking_info": 1, "location": 1}}
                    ])
                    .sort({"booking_info.start": 1})
                    .exec(function (err, details) {
                        // populate the data after 
                        var options = [
                            {path: 'tutor_id', model: 'tutors', select: 'personalInfo currentlyActive lastSeen'},
                            {path: 'student_id', model: 'learners', select: 'personalInfo currentlyActive lastSeen'},
                            {path: 'subject_id', model: 'subjects', select: 'name type'},
                            {path: 'level_id', model: 'levels', select: 'name'}
                        ];

                        bookingObj.populate(details, options, function (err, data) {
                            if (err) {
                                res.jsonp({status: 201, msg: err});
                            } else {
                                res.jsonp({status: 200, msg: "", data: data});
                            }
                        });

                    });
        });
    }

}

/*
 * @created     8/05/2017
 * @author      Amanpreet Singh
 * @desc        getAppCompletedEvents
 * @usage       Mobile
 * @copyright   smartData
 */
function getAppCompletedEvents(req, res) {
    var type = req.body.type; // to check learner or tutor
    var conditions = {};
    var otherconditions = {};
    var start = moment().startOf('day').toISOString();
    var end = moment().endOf('day').toISOString();
    var isToday = req.body.isToday;
    var startDate = moment(req.body.startdate).toISOString();
    var endDate = moment(req.body.enddate).toISOString();

    if (type === 'tutors') {
        conditions = {
            "tutor_id": ObjectId(req.body.tutor_id),
            "payment_info.payment_status": 'Paid',
            "isDeleted": false
        };

        if (isToday === true) {
            otherconditions = {"booking_info.is_completed": true, "booking_info.start": {$gte: new Date(start), $lte: new Date(end)}};
        } else {
            otherconditions = {"booking_info.is_completed": true, "booking_info.start": {$gte: new Date(start)}};
        }

        if (!_.isUndefined(req.body.startdate) && !_.isUndefined(req.body.enddate)) {
            otherconditions = {"booking_info.is_completed": true, "booking_info.start": {$gte: new Date(startDate), $lte: new Date(endDate)}};
        }


        bookingObj
                .aggregate([
                    {$match: conditions},
                    {$unwind: "$booking_info"},
                    {$match: otherconditions},
                    {$project: {"_id": 1, "tutor_id": 1, "student_id": 1, "level_id": 1, "subject_id": 1, "package_id": 1, "booking_info": 1, "location": 1}}
                ])
                .sort({"booking_info.end": 1})
                .exec(function (err, details) {
                    // populate the data after 
                    var options = [
                        {path: 'tutor_id', model: 'tutors', select: 'personalInfo currentlyActive lastSeen'},
                        {path: 'student_id', model: 'learners', select: 'personalInfo currentlyActive lastSeen'},
                        {path: 'subject_id', model: 'subjects', select: 'name type'},
                        {path: 'level_id', model: 'levels', select: 'name'}
                    ];

                    bookingObj.populate(details, options, function (err, data) {
                        if (err) {
                            res.jsonp({status: 201, msg: err});
                        } else {
                            res.jsonp({status: 200, msg: "", data: data});
                        }
                    });

                });
    }

    if (type === 'learners') {
        fetchMeAndMyLinkIds(req.body.student_id, function (err, myids) {
            conditions = {
                "student_id": {$in: myids},
                "payment_info.payment_status": 'Paid',
                "isDeleted": false
            };

            if (isToday === true) {
                otherconditions = {"booking_info.is_completed": true, "booking_info.start": {$gte: new Date(start), $lte: new Date(end)}};
            } else {
                otherconditions = {"booking_info.is_completed": true, "booking_info.start": {$gte: new Date(start)}};
            }

            if (!_.isUndefined(req.body.startdate) && !_.isUndefined(req.body.enddate)) {
                otherconditions = {"booking_info.is_completed": true, "booking_info.start": {$gte: new Date(startDate), $lte: new Date(endDate)}};
            }

            bookingObj
                    .aggregate([
                        {$match: conditions},
                        {$unwind: "$booking_info"},
                        {$match: otherconditions},
                        {$project: {"_id": 1, "tutor_id": 1, "student_id": 1, "level_id": 1, "subject_id": 1, "package_id": 1, "booking_info": 1, "location": 1}}
                    ])
                    .sort({"booking_info.start": 1})
                    .exec(function (err, details) {
                        // populate the data after 
                        var options = [
                            {path: 'tutor_id', model: 'tutors', select: 'personalInfo currentlyActive lastSeen'},
                            {path: 'student_id', model: 'learners', select: 'personalInfo currentlyActive lastSeen'},
                            {path: 'subject_id', model: 'subjects', select: 'name type'},
                            {path: 'level_id', model: 'levels', select: 'name'}
                        ];

                        bookingObj.populate(details, options, function (err, data) {
                            if (err) {
                                res.jsonp({status: 201, msg: err});
                            } else {
                                res.jsonp({status: 200, msg: "", data: data});
                            }
                        });

                    });
        });

    }

}

/*
 * @created     11/05/2017
 * @author      Amanpreet Singh
 * @desc        getBackPackActivities
 * @usage       Mobile
 * @copyright   smartData
 */
function getBackPackActivities(req, res) {
    var fields = {};
    var conditions = {userId: req.params.id, "infoType.type": "Backpack"};
    var sort = {notificationDate: -1};
    var limit = 5;


    notificationsObj.find(conditions, fields)
            .sort(sort)
            .limit(limit)
            .exec(function (err, data) {
                if (err) {
                    res.jsonp(err);
                } else {
                    if (data.length === 0) {
                        list = [];
                    } else {
                        list = data;
                    }
                    res.jsonp({status: 200, msg: "get learner notifications successfully.", data: list});
                }
            });
}

/*
 * @created     22/11/2017
 * @author      Amanpreet Singh
 * @desc        cancelLearnerScheduleEvent - Change Request sent to Tutor from Learner's end
 * @usage       Web
 * @copyright   smartData
 */
function cancelLearnerScheduleEvent(req, res) {
    var updateConditions = {
        _id: ObjectId(req.body._id)
    };
    var updateFields = {
        reschedule_info: {},
        schedule_status: 'pending'
    };

    var templateData = {}; // for notifications
    var activity = {}; // for recent activity
    var activitytemplate = {};
    var rescheduleLog = {};
    var pushData = {};
    var userObj = {};

    // Reschedule Log
    rescheduleLog = {
        tutor_id: ObjectId(req.body.tutor_id),
        booking_id: ObjectId(req.body.booking_id),
        student_id: ObjectId(req.body.student_id),
        lesson_id: ObjectId(req.body.lesson_id),
        reschedule_by: 'learner',
        original_date: req.body.reschedule_info,
        new_date: req.body.change_time,
        reschedule_status: 'Change Request'
    };

    var response = {};

    async.waterfall([
        function (callback) { // update the schedule event
            scheduleObj
                    .findOneAndUpdate(updateConditions, {$set: updateFields}, {new : true})
                    .populate([
                        {path: 'tutor_id', select: 'personalInfo email currTimeOffset deviceId '},
                        {path: 'student_id', select: 'personalInfo email currTimeOffset deviceId '},
                        {path: 'subject_id', select: 'name'}
                    ])
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            callback(null, data);
                        }
                    });
        },
        function (data, callback) { // request session log
            reschedulelessionlogObj(rescheduleLog).save(function (err) {
                if (err) {
                    return callback(err);
                } else {
                    callback(null, data);
                }
            });
        },
        function (data, callback) { // email notifications and recent activities
            var l_fname = (data.student_id.personalInfo.firstName) ? (data.student_id.personalInfo.firstName) : 'Learner';
            var t_fname = (data.tutor_id.personalInfo.firstName) ? (data.tutor_id.personalInfo.firstName) : 'Tutor';
            templateData = {
                emailTo: data.tutor_id.email,
                emailToName: t_fname,
                declinedby: l_fname,
                subject_name: data.subject_id.name
            };
            emailServiceObj.sendChangeRequest(templateData);
            //push notification in case of change request
            if (data.tutor_id && data.tutor_id.deviceId) {
                var jsonobj = {noti_section: 'lesson_notification', noti_data: {}};
                pushData = {
                    title: 'Change Request',
                    body: l_fname + ' has asked for a change request for reschedule of lesson for ' + data.subject_id.name,
                    jsonobj: jsonobj
                };
                userObj = {
                    senderId: '',
                    senderType: '',
                    receiverId: data.tutor_id._id,
                    receiverType: 'tutors'
                };
                pushNoti.sendPushNotificationByUserId(userObj, pushData);
            }
            callback(null, true);
        }
    ], function (err, result) {
        if (err) {
            response = {status: 201, message: err};
            res.jsonp(response);
        } else {
            if (result === true) {
                response = {status: 200, message: "Event updated successfully"};
                res.jsonp(response);
            } else {
                response = {status: 201, message: "Event not updated successfully"};
                res.jsonp(response);
            }
        }
    });
}


/*
 * @created     22/11/2017
 * @author      Amanpreet Singh
 * @desc        cancelTutorScheduleEvent - Change Request sent to Learner from Tutor's end
 * @usage       Web
 * @copyright   smartData
 */
function cancelTutorScheduleEvent(req, res) {
    var updateConditions = {
        _id: ObjectId(req.body._id)
    };
    var updateFields = {
        reschedule_info: {},
        schedule_status: 'pending'
    };

    var templateData = {}; // for notifications
    var activity = {}; // for recent activity
    var activitytemplate = {};
    var rescheduleLog = {};
    var response = {};
    var pushData = {};
    var userObj = {};
    var jsonobj = {noti_section: 'lesson_notification', noti_data: {}};

    // Reschedule Log
    rescheduleLog = {
        tutor_id: ObjectId(req.body.tutor_id),
        booking_id: ObjectId(req.body.booking_id),
        student_id: ObjectId(req.body.student_id),
        lesson_id: ObjectId(req.body.lesson_id),
        reschedule_by: 'tutor',
        original_date: req.body.resechedule_info,
        new_date: req.body.change_time,
        reschedule_status: 'Change Request'
    };

    async.waterfall([
        function (callback) { // update the schedule event
            scheduleObj
                    .findOneAndUpdate(updateConditions, {$set: updateFields}, {new : true})
                    .populate([
                        {path: 'student_id', select: 'personalInfo email currTimeOffset deviceId '},
                        {path: 'subject_id', select: 'name'},
                        {path: 'tutor_id', select: 'personalInfo email currTimeOffset deviceId '},
                        {path: 'level_id', select: 'name'}
                    ])
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            callback(null, data);
                        }
                    });
        },
        function (data, callback) { // save request session log
            reschedulelessionlogObj(rescheduleLog).save(function (err) {
                if (err) {
                    return callback(err);
                } else {
                    callback(null, data);
                }
            });
        },
        function (data, callback) { // email notifications and recent activities
            var l_fname = (data.student_id.personalInfo.firstName) ? (data.student_id.personalInfo.firstName) : 'Learner';
            var t_fname = (data.tutor_id.personalInfo.firstName) ? (data.tutor_id.personalInfo.firstName) : 'Tutor';
            templateData = {
                emailTo: data.student_id.email,
                emailToName: l_fname,
                declinedby: t_fname,
                subject_name: data.subject_id.name
            };
            emailServiceObj.sendChangeRequest(templateData);
            //push notification in case of change request
            if (data.student_id && data.student_id.deviceId) {
                pushData = {
                    title: 'Change Request',
                    body: t_fname + ' has asked for a change request for reschedule of lesson for ' + data.subject_id.name,
                    jsonobj: jsonobj
                };
                userObj = {
                    senderId: '',
                    senderType: '',
                    receiverId: data.student_id._id,
                    receiverType: 'learners'
                };
                pushNoti.sendPushNotificationByUserId(userObj, pushData);
            }
            callback(null, true);
        }
    ], function (err, result) {
        if (err) {
            console.log('err', err);
            response = {status: 201, message: err};
            res.jsonp(response);
        } else {
            if (result === true) {
                response = {status: 200, message: "Event updated successfully"};
                res.jsonp(response);
            } else {
                response = {status: 201, message: "Event not updated successfully"};
                res.jsonp(response);
            }
        }
    });
}


/*
 * @created     12/06/2018
 * @author      Amanpreet Singh
 * @desc        save interview info without any booking
 * @copyright   smartData
 */
function saveInterviewInfo(req, res) {
    var bookingData = req.body;
    var scheduleData = [];
    var afterbookingData = [];
    var tutortemplate = {};
    var learnertemplate = {};
    var activity = {}; // For Activities
    var activitytemplate = {}; // For activity Template content
    var activity1 = {};
    var activitytemplate1 = {};
    var pushData = {}; // For push notifications
    var userObj = {}; // user object for push notifications
    var conditions = {
        "$or": [
            {"tutor_id": ObjectId(req.body.tutor_id)},
            {"student_id": ObjectId(req.body.student_id)}
        ],
        "start": {
            $gte: moment().startOf('day').toISOString()
        },
        "isDeleted": false,
        "enable": true
    };

    var checkEvent = [];
    var interviewStart = moment(req.body.interviewschedule.interviewstart);
    var interviewEnd = moment(req.body.interviewschedule.interviewend);
    // create interview object for db insertion
    var interview = {
        "title": "Interview",
        "start": interviewStart,
        "end": interviewEnd,
        "allDay": false,
        "overlap": false,
        "subject_id": ObjectId(req.body.subject_id),
        "level_id": ObjectId(req.body.level_id),
        "tutor_id": ObjectId(req.body.tutor_id),
        "student_id": ObjectId(req.body.student_id),
        "color": "#3B3A32",
        "isDeleted": false,
        "enable": true,
        "type": "interview"
    };
    scheduleData.push(interview);
    var bookingInfo = req.body.booking_info;


    async.waterfall([
        function (callback) { // check tutor or learner interviews
            scheduleObj.find(conditions)
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            var events = data; //_.reject(data,{"_id":ObjectId(req.body._id) });

                            _.forEach(events, function (key) {
                                var startEvent = moment(key.start);
                                var endEvent = moment(key.end);
                                // checks if event does not conflict previous events        
                                if (Math.round(startEvent) / 1000 < Math.round(interviewEnd) / 1000 && Math.round(endEvent) > Math.round(interviewStart)) {
                                    checkEvent.push(true);
                                }
                            });
                            if (checkEvent.length > 0) {
                                err = 'Another Interview is scheduled for the time selected';
                                return callback(err);
                            } else {
                                callback(null, true);
                            }
                        }
                    });
        },
        function (noconflict, callback) { // check learner interviews
            scheduleObj.find(conditions)
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            var events = data;

                            _.forEach(events, function (key) {
                                var startEvent = moment(key.start);
                                var endEvent = moment(key.end);
                                // checks if event does not conflict previous events 
                                _.forEach(bookingInfo, function (bookevent) {

                                    var bookingStart = moment(bookevent.start);
                                    var bookingEnd = moment(bookevent.end);

                                    if (Math.round(startEvent) / 1000 < Math.round(bookingEnd) / 1000 &&
                                            Math.round(endEvent) > Math.round(bookingStart)) {
                                        checkEvent.push(true);
                                    }
                                });
                            });

                            if (checkEvent.length > 0) {
                                err = 'There is already a booking scheduled for the time selected';
                                return callback(err);
                            } else {
                                callback(null, true);
                            }
                        }
                    });
        },
        function (details, callback) { // save tutor bookings
            crypto.randomBytes(5, function (err, buf) {
                var booking_ref = buf.toString('hex');
                bookingData = _.extend({}, bookingData, {booking_ref: booking_ref});

                bookingObj(bookingData).save(function (err, data) {
                    if (err) {
                        return callback(err);
                    } else {
                        callback(null, data);
                    }
                });
            });

        },
        function (booking, callback) { // save the details into schedules collection
            var bookingId = booking._id;

            _.forEach(scheduleData, function (v, k) {
                // In case interview is there
                if (v.type === 'interview') {
                    v = _.extend({}, v, {booking_id: ObjectId(bookingId)});
                    afterbookingData.push(v);
                }
            });

            scheduleObj.create(afterbookingData, function (err) {
                if (err) {
                    return callback(err);
                } else {
                    callback(null, booking);
                }
            });
        },
        function (booking, callback) { // for email and other notifications
            var bookingId = booking._id;
            bookingObj.findOne({"_id": bookingId})
                    .populate([
                        {path: 'tutor_id', select: 'personalInfo email currTimeOffset deviceId '},
                        {path: 'student_id', select: 'personalInfo email currTimeOffset deviceId '},
                        {path: 'subject_id', select: 'name'},
                        {path: 'package_id'}
                    ])
                    .lean()
                    .exec(function (err, data) {
                        if (err) {

                        } else {
                            // Learner & Tutor first and last name 
                            var l_fname = (data.student_id.personalInfo.firstName) ? (data.student_id.personalInfo.firstName) : 'Learner';
                            var l_lname = (data.student_id.personalInfo.lastName) ? (data.student_id.personalInfo.lastName) : '';
                            var t_fname = (data.tutor_id.personalInfo.firstName) ? (data.tutor_id.personalInfo.firstName) : 'Tutor';
                            var t_lname = (data.tutor_id.personalInfo.lastName) ? (data.tutor_id.personalInfo.lastName) : '';

                            var l_offset = (data.student_id.currTimeOffset) ? data.student_id.currTimeOffset : '+0000';
                            var t_offset = (data.tutor_id.currTimeOffset) ? data.tutor_id.currTimeOffset : '+0000';

                            //push notification in case of successful booking
                            if (data.tutor_id && data.tutor_id.deviceId) {
                                var jsonobj = {noti_section: 'lesson_notification', noti_data: {}};

                                pushData = {
                                    title: 'Video Interview',
                                    body: l_fname + ' ' + l_lname + ' has booked an Interview for ' + data.subject_id.name,
                                    jsonobj: jsonobj
                                };

                                userObj = {
                                    senderId: '',
                                    senderType: '',
                                    receiverId: data.tutor_id._id,
                                    receiverType: 'tutors'
                                };
                                pushNoti.sendPushNotificationByUserId(userObj, pushData);
                            }

                            // Email, Recent Activity & App Notification
                            tutortemplate = {
                                emailTo: data.tutor_id.email,
                                emailToName: t_fname,
                                learnername: l_fname + ' ' + l_lname,
                                interviewtime: moment(interviewStart).utcOffset(t_offset).format("dddd, MMMM Do YYYY, h:mm:ss a")
                            };

                            learnertemplate = {
                                emailTo: data.student_id.email,
                                emailToName: l_fname,
                                tutorname: t_fname + ' ' + t_lname,
                                interviewtime: moment(interviewStart).utcOffset(l_offset).format("dddd, MMMM Do YYYY, h:mm:ss a")
                            };

                            activity = {slug: 'learner-video-interview-request', user_id: data.student_id._id, role: 'learners'};
                            activitytemplate = {
                                TNAME: t_fname + ' ' + t_lname,
                                SUBJECTNAME: data.subject_id.name
                            };

                            activity1 = {slug: 'tutor-video-interview-request', user_id: data.tutor_id._id, role: 'tutors'};
                            activitytemplate1 = {
                                LNAME: l_fname + ' ' + l_lname,
                                SUBJECTNAME: data.subject_id.name
                            };

                            emailServiceObj.callInterviewRequestMail(tutortemplate, 'tutor');
                            emailServiceObj.callInterviewRequestMail(learnertemplate, 'learner');
                            activityObj.triggerActivity(activity, activitytemplate);
                            activityObj.triggerActivity(activity1, activitytemplate1);

                            callback(null, bookingId);
                        }
                    });
        }
    ], function (err, result) {
        if (err) {
            response = {status: 201, message: err};
            res.jsonp(response);
        } else {
            if (!_.isEmpty(result)) {
                response = {status: 200, message: "booking lesson info saved successfully", data: result};
                res.jsonp(response);
            } else {
                response = {status: 201, message: "Event not updated successfully"};
                res.jsonp(response);
            }
        }
    });
}

/*
 * @created     20/06/2018
 * @author      Amanpreet Singh
 * @desc        save booking info
 * @copyright   smartData
 */
function saveOnlyBooking(req, res) {
    var stripeCredentials = process.LaSec['stripe-credentials'];
    var stripe = require('stripe')(stripeCredentials.stripe_secret_key);

    var bookingData = req.body;
    var scheduleData = [];
    var afterbookingData = [];
    var paymentlogData = [];
    var afterpaymentData = [];
    var bookingtemplateData1 = []; // tutor
    var bookingtemplateData2 = []; // learner
    var walletData = {};
    var token = req.body.token;
    var stripe_data = {};
    var tutortemplate = {};
    var learnertemplate = {};
    var activity = {}; // For Activities
    var activitytemplate = {}; // For activity Template content
    var activity1 = {};
    var activitytemplate1 = {};
    var pushData = {}; // For push notifications
    var userObj = {}; // user object for push notifications
    var conditions = {
        "$or": [
            {"tutor_id": ObjectId(req.body.tutor_id)},
            {"student_id": ObjectId(req.body.student_id)}
        ],
        "start": {
            $gte: moment().startOf('day').toISOString()
        },
        "isDeleted": false,
        "enable": true
    };

    var checkEvent = [];
    var paymentInfo = req.body.payment_info;
    var bookingInfo = req.body.booking_info;
    if (bookingInfo) {
        var index = 1;
        _.forEach(bookingInfo, function (v) {
            // Schedule Data
            scheduleData.push({
                "title": "Lesson",
                "start": v.start,
                "end": v.end,
                "allDay": false,
                "overlap": false,
                "subject_id": ObjectId(req.body.subject_id),
                "level_id": ObjectId(req.body.level_id),
                "tutor_id": ObjectId(req.body.tutor_id),
                "student_id": ObjectId(req.body.student_id),
                "color": "#3B3A32",
                "isDeleted": false,
                "enable": true,
                "type": "lesson",
                "lesson_duration": v.lesson_duration,
                "lesson_price": v.lesson_price
            });

            // Payment Log
            paymentlogData.push({
                "payment_status": 'pending',
                "payment_type": 'booking',
                "payment_desc": 'Lesson (#' + index + ')',
                "payment_to": {
                    role: 'tutors',
                    user: ObjectId(req.body.tutor_id)
                },
                "payment_from": {
                    role: 'learners',
                    user: ObjectId(req.body.student_id)
                },
                payment_amount: v.lesson_price,
                isAdminReceived: true
            });
            index++;
        });
        // Wallet Data
        walletData = {
            wallet_type: req.body.subject_type,
            wallet_desc: 'For booking of ' + req.body.no_of_lessons + ' lesson packages',
            wallet_user: {
                role: 'learners',
                user: ObjectId(req.body.student_id)
            },
            debit_amount: paymentInfo.totalbookingamount,
            wallet_status: 'paid'
        };
    }

    async.waterfall([
        function (callback) { // check learner interviews
            scheduleObj.find(conditions)
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            var events = data;

                            _.forEach(events, function (key) {
                                var startEvent = moment(key.start);
                                var endEvent = moment(key.end);
                                // checks if event does not conflict previous events 
                                _.forEach(bookingInfo, function (bookevent) {

                                    var bookingStart = moment(bookevent.start);
                                    var bookingEnd = moment(bookevent.end);

                                    if (Math.round(startEvent) / 1000 < Math.round(bookingEnd) / 1000 &&
                                            Math.round(endEvent) > Math.round(bookingStart)) {
                                        checkEvent.push(true);
                                    }
                                });
                            });

                            if (checkEvent.length > 0) {
                                err = 'There is already a booking scheduled for the time selected';
                                return callback(err);
                            } else {
                                callback(null, true);
                            }
                        }
                    });
        },
        function (noconflict, callback) { // Create Stripe Charge for the Customer
            if (token) {
                var price = paymentInfo.totalbookingamount * 100; // converting the amount into cents
                stripe.customers.create({
                    email: token.email,
                    source: token.id
                }).then(function (customer) {
                    return stripe.charges.create({
                        amount: price,
                        currency: constantObj.stripeCredentials.currency,
                        customer: customer.id
                    });
                }).then(function (charge) {
                    stripe_data = {
                        charge_id: charge.id,
                        amount: charge.amount,
                        application_fee: charge.application_fee,
                        customer: charge.customer,
                        captured: charge.captured,
                        currency: charge.currency,
                        created: charge.created,
                        balance_transaction: charge.balance_transaction
                    };
                    return stripe.balance.retrieveTransaction(
                            charge.balance_transaction
                            );
                }).then(function (balance) {
                    stripe_data.description = balance.description;
                    stripe_data.available_on = balance.available_on;
                    stripe_data.fee_details = balance.fee_details;
                    stripe_data.net = balance.net;
                    callback(null, stripe_data);
                }).catch(function (err) {
                    console.log(err);
                    return callback(err);
                });
            } else {
                callback(null, {});
            }
        },
        function (stripe, callback) { // save tutor bookings
            bookingData = _.extend({}, bookingData, {stripe_details: stripe, current_booking_status: "Current"});
            bookingObj.findOneAndUpdate({_id: req.body._id}, {$set: bookingData}, {new : true})
                    .exec(function (err, data) {
                        if (err) {
                            return callback(err);
                        } else {
                            callback(null, data);
                        }
                    });

        },
        function (booking, callback) { // save the details into schedules collection
            var bookingId = booking._id;
            var lessonindex = 0;
            _.forEach(scheduleData, function (v, k) {
                // for booking slots only 
                if (v.type === 'lesson') {
                    var lesson = booking.booking_info[lessonindex];
                    v = _.extend({}, v, {booking_id: ObjectId(bookingId), lesson_id: ObjectId(lesson._id)});
                    afterbookingData.push(v);
                    lessonindex++;
                }
            });

            scheduleObj.create(afterbookingData, function (err) {
                if (err) {
                    return callback(err);
                } else {
                    callback(null, booking);
                }
            });
        },
        function (booking, callback) { // insert the record into payment log
            var bookingId = booking._id;
            var lessonindex = 0;
            _.forEach(paymentlogData, function (v, k) {
                // for booking slots only 
                var lesson = booking.booking_info[lessonindex];
                v = _.extend({}, v, {booking_id: ObjectId(bookingId), lesson_id: ObjectId(lesson._id)});
                afterpaymentData.push(v);
                lessonindex++;
            });

            paymentlogObj.create(afterpaymentData, function (err) {
                if (err) {
                    return callback(err);
                } else {
                    callback(null, booking);
                }
            });
        },
        function (booking, callback) { // insert the record into wallet collection
            var bookingId = booking._id;
            var reference = booking.booking_ref;
            var receipt_no = biguint(crypto.randomBytes(4), 'dec', {groupsize: 5, delimiter: '-'});

            walletData = _.extend({}, walletData, {
                booking_id: ObjectId(bookingId),
                reference_no: reference,
                receipt_no: receipt_no
            });

            walletObj(walletData).save(function (err, data) {
                if (err) {
                    return callback(err);
                } else {
                    callback(null, bookingId);
                }
            });

        },
        function (bookingId, callback) { // for email and other notifications
            bookingObj.findOne({"_id": bookingId})
                    .populate([
                        {path: 'tutor_id', select: 'personalInfo email currTimeOffset deviceId '},
                        {path: 'student_id', select: 'personalInfo email currTimeOffset deviceId '},
                        {path: 'subject_id', select: 'name'},
                        {path: 'package_id'}
                    ])
                    .lean()
                    .exec(function (err, data) {
                        if (err) {

                        } else {
                            // Learner & Tutor first and last name 
                            var l_fname = (data.student_id.personalInfo.firstName) ? (data.student_id.personalInfo.firstName) : 'Learner';
                            var l_lname = (data.student_id.personalInfo.lastName) ? (data.student_id.personalInfo.lastName) : '';
                            var t_fname = (data.tutor_id.personalInfo.firstName) ? (data.tutor_id.personalInfo.firstName) : 'Tutor';
                            var t_lname = (data.tutor_id.personalInfo.lastName) ? (data.tutor_id.personalInfo.lastName) : '';

                            var l_offset = (data.student_id.currTimeOffset) ? data.student_id.currTimeOffset : '+0000';
                            var t_offset = (data.tutor_id.currTimeOffset) ? data.tutor_id.currTimeOffset : '+0000';

                            //push notification in case of successful booking
                            if (data.tutor_id && data.tutor_id.deviceId) {
                                var jsonobj = {noti_section: 'lesson_notification', noti_data: {}};

                                pushData = {
                                    title: 'Lesson Booking',
                                    body: l_fname + ' ' + l_lname + ' has booked you for ' + data.subject_id.name + ' with #' + req.body.no_of_lessons + ' lessons',
                                    jsonobj: jsonobj
                                };

                                userObj = {
                                    senderId: '',
                                    senderType: '',
                                    receiverId: data.tutor_id._id,
                                    receiverType: 'tutors'
                                };
                                pushNoti.sendPushNotificationByUserId(userObj, pushData);
                            }

                            // Email, Recent Activity & App Notification

                            index = 1;
                            _.forEach(bookingInfo, function (v) {
                                bookingtemplateData1.push({
                                    "lessonname": "Lesson " + index,
                                    "duration": v.lesson_duration + "hr",
                                    "lessontime": moment(v.start).utcOffset(t_offset).format("DD/MM/YYYY hh:mm A"),
                                    "price": "$" + v.lesson_price,
                                    "subtotal": "$" + v.lesson_price
                                });

                                bookingtemplateData2.push({
                                    "lessonname": "Lesson " + index,
                                    "duration": v.lesson_duration + "hr",
                                    "lessontime": moment(v.start).utcOffset(l_offset).format("DD/MM/YYYY hh:mm A"),
                                    "price": "$" + v.lesson_price,
                                    "subtotal": "$" + v.lesson_price
                                });
                                index++;
                            });

                            tutortemplate = {
                                emailTo: data.tutor_id.email,
                                emailToName: t_fname,
                                learnername: l_fname + ' ' + l_lname,
                                tutorname: t_fname + ' ' + t_lname,
                                subject_name: data.subject_id.name,
                                packagename: data.package_id.number_lesson + ' lesson package -' + data.package_id.name,
                                ref_no: data.booking_ref,
                                totalpayment: "$" + paymentInfo.totalbookingamount,
                                lessonarr: bookingtemplateData1
                            };

                            learnertemplate = {
                                emailTo: data.student_id.email,
                                emailToName: l_fname,
                                learnername: l_fname + ' ' + l_lname,
                                tutorname: t_fname + ' ' + t_lname,
                                subject_name: data.subject_id.name,
                                packagename: data.package_id.number_lesson + ' lesson package -' + data.package_id.name,
                                ref_no: data.booking_ref,
                                totalpayment: "$" + paymentInfo.totalbookingamount,
                                lessonarr: bookingtemplateData2
                            };

                            activity = {slug: 'payment-done', user_id: data.student_id._id, role: 'learners'};
                            activitytemplate = {
                                TNAME: t_fname + ' ' + t_lname,
                                NO_OF_LESSONS: req.body.no_of_lessons,
                                AMOUNT: paymentInfo.totalbookingamount
                            };

                            activity1 = {slug: 'tutor-booked-info', user_id: data.tutor_id._id, role: 'tutors'};
                            activitytemplate1 = {
                                LNAME: l_fname + ' ' + l_lname,
                                SUBJECTNAME: data.subject_id.name
                            };

                            emailServiceObj.sendBookingDetailsMail(tutortemplate, 'tutor');
                            emailServiceObj.sendBookingDetailsMail(learnertemplate, 'learner');
                            activityObj.triggerActivity(activity, activitytemplate);
                            activityObj.triggerActivity(activity1, activitytemplate1);

                            callback(null, bookingId);
                        }
                    });
        }
    ], function (err, result) {
        if (err) {
            response = {status: 201, message: err};
            res.jsonp(response);
        } else {
            if (!_.isEmpty(result)) {
                response = {status: 200, message: "booking lesson info saved successfully", data: result};
                res.jsonp(response);
            } else {
                response = {status: 201, message: "Event not updated successfully"};
                res.jsonp(response);
            }
        }
    });
}

/*
 * @created     04/09/2018
 * @author      Amanpreet Singh
 * @desc        get Exceptionlist
 * @copyright   smartData
 */
function getExceptionList(req, res) {
    var tutor_id = ObjectId(req.params.id);
    conditions = {
        "tutor_id": tutor_id, 
        "isDeleted": false,
        "enable": true,
        "start": {
            $gte: moment().startOf('day').toISOString()
        },
        "type": "exception"
    };

    scheduleObj
            .find(conditions)
            .sort({"start": 1})
            .exec(function (err, data) {
                if (err) {
                    res.jsonp({status: 201, message: err});
                } else {
                    res.jsonp({status: 200, message: "exception list", data: data});
                }
            });
}

/*
 * @created     04/09/2018
 * @author      Amanpreet Singh
 * @desc        delete exception
 * @copyright   smartData
 */
function deleteException(req, res) {
    var id = ObjectId(req.body.id);

    scheduleObj
            .findOneAndUpdate({_id: id}, {$set: {isDeleted: true}})
            .exec(function (err, data) {
                if (err) {
                    res.jsonp({status: 201, message: err});
                } else {
                    res.jsonp({status: 200, message: "success"});
                }
            });
}