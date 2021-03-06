var express       = require("express"),
router            = express.Router(),
path              = require('path'),
crypto            = require('crypto'),
multer            = require('multer'),
mongoose          = require('mongoose'),
GridFsStorage     = require('multer-gridfs-storage'),
Grid              = require('gridfs-stream'),
passport          = require('passport'),
nodemailer        = require('nodemailer'),
Student           = require('../models/students'),
Teacher           = require('../models/teachers'),
middleware        = require('../middleware');

eval(`Grid.prototype.findOne = ${Grid.prototype.findOne.toString().replace('nextObject', 'next')}`);

const {check, validationResult, body} = require('express-validator');

//<============================================ Database URI =================================================>
const mongoURI = process.env.MONGODB_URL;
const conn = mongoose.createConnection(mongoURI, {useUnifiedTopology: true });

// <======================================== GFS ==============================================================>

let gfs;

conn.once('open',() => {
    gfs = Grid(conn.db, mongoose.mongo);
    gfs.collection('uploads');
    // all set!
});

// <=========================================== Storage Engine ================================================>
// Here
const storage = new GridFsStorage({
    url: mongoURI,
    file: (req, file) => {
        return new Promise((resolve, reject) => {
        crypto.randomBytes(16, (err, buf) => {
          if (err) {
            return reject(err);
          }
          const metadata = {
              title: req.body.title,
              description: req.body.description,
              id: req.user._id,
              by: req.user.name,
          };
          const filename = buf.toString('hex') + path.extname(file.originalname);
          const fileInfo = {
            filename: filename,
            metadata: metadata,
            bucketName: 'uploads'
          };
          resolve(fileInfo);
        });
      });
    }
});
const upload = multer({ storage,
    // File Filter
    fileFilter: function (req, file, callback) {
        var ext = path.extname(file.originalname);
        if(ext !== '.doc' && ext !== '.pdf' && ext !== '.txt' && ext !== '.docx') {
            req.fileValidationError = 'goes wrong on the mimetype';
            return callback(null, false, new Error('goes wrong on the mimetype'));
            // return callback(new Error('Only Text files are allowed'))
        }
        callback(null, true)
    } });
// ============================================Nodemailer=================================================================>
let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        type: 'login',
        port: 587,  //465
        secure: true,
        user: process.env.USER,
        pass: process.env.PASS
    }
});

// <================================================= Routes ===================================================>

router.get('/teachers', middleware.isLoggedIn, (req, res) => 
    res.render('teacher/index'));

router.get('/teachers/login', (req, res) => {
    res.render('teacher/login');
});

router.post('/teachers/login', passport.authenticate('teacherLocal', {successRedirect: '/teachers', failureRedirect: '/teachers/login', failureFlash: true ,successFlash: 'Welcome'}), function(req, res){ 
});


router.get('/teachers/add', middleware.isLoggedIn, (req, res) => {
    res.render('teacher/add', {errors: false, formData: false});
});

router.post('/teachers/add', [
    check('email', 'Invalid Email Id').isEmail(), 
    check('password', 'Password should be 6 charcters or more').isLength({min: 5}),
    body('cpassword').custom((value, { req }) => {
        if (value !== req.body.password) {
          throw new Error('Password confirmation does not match password');
        }
        
        // Indicates the success of this synchronous custom validator
        return true;
      })   
    ], middleware.isLoggedIn, (req, res) => {
    const errors = validationResult(req).array();
    if (errors.length > 0) {
        var name = req.body.name;
        var email = req.body.email;
        var username = req.body.username;
    
        var formData = {
            name: name,
            email: email,
            username: username
        }
        return res.render('teacher/add', {errors: errors, formData: formData});
      } else  {
    var name = req.body.name.trim(),
        email = req.body.email.trim(),
        username = req.body.username.trim(),
        password = req.body.password.trim(),
        teacher = req.user._id,
        designation = "Student";

    var newStudent = new Student ({
        name: name,
        email: email,
        username: username,
        password: password,
        teacher: teacher,
        designation: designation
    });
    Student.getUserByUsername(username, (err, student) => {
        if(student){
            req.flash('error', 'Username is already registered');
            return res.redirect('/teachers/add');
        } else {
            const data = `
            <div style="width: 450px; border: 2px dotted black; padding: 30px; font-family: Cambria, Cochin, Georgia, Times, 'Times New Roman', serif;">
                <h1 style="text-align: center; text-decoration: underline;">Student Overview System</h1>
                <h3 style="padding-top: 10px;">You're Successfully Added as a Student</h3>
                <div style="text-align: center; padding: 20px;">
                    <img src="https://cdn3.iconfinder.com/data/icons/education-2-2/256/Student_Reading-512.png" alt="teacher-img" style="width: 50%; border-radius: 50%; border: 2px solid black;">
                </div>
                <p>Here are your account details: </p>
                <ul>
                    <li>Name: ${name}</li>
                    <li>Email: ${email}</li>
                    <li>Username: ${username}</li>
                </ul>
                <p><strong>Note: </strong>For password contact your respective teacher</p>
                <a href="https://ancient-oasis-06214.herokuapp.com/students/login">Click Here To Login</a>
            </div>
                `;
                let mailOptions = {
                    from: 'developer.rs2020@gmail.com',
                    to: email,
                    subject: 'Account Created',
                    html: data
                }
                transporter.sendMail(mailOptions, (err, data) => {
                    if(err){
                        console.log(err);
                    } else {
                        console.log("Sent!")
                    }
                });
            Student.createUser(newStudent, function(err, student){
                if(err) throw err;
                else {
                    Teacher.findById(req.user._id, function(err, teacher){
                        teacher.myStudents.push(student);
                        teacher.save();
                    });
                    req.flash('success', 'Email has been sent!')
                    res.redirect('/teachers');
                }
            });
        }
    });
     }
});

router.get('/teachers/manage', middleware.isLoggedIn, (req, res) =>{
    Teacher.findById(req.user._id).populate("myStudents").exec(function(err, foundStudent){
        if(err){
            console.log(err);
        } else {
            res.render('teacher/manage', {pupil: foundStudent});
        }
    });
});

router.get('/teachers/manage/:id/edit', middleware.isLoggedIn, (req, res) => {
    Student.findById(req.params.id, (err, foundStudent) => {
        if(err){
            console.log(err);
        } else {
            res.render('teacher/edit', {errors: false, student: foundStudent});
        }
    });
});

router.put('/teachers/manage/:id/edit', middleware.isLoggedIn, (req, res) => {
    Student.findByIdAndUpdate(req.params.id, req.body.student, (err, updatedStudent) => {
        if(err){
            console.log(err);
        } else {
            req.flash('success', 'Successfully Updated Student');
            res.redirect('/teachers/manage');
        }
    });
});

router.delete('/teachers/manage/:id', middleware.isLoggedIn, (req, res) => {
    Teacher.findById(req.user._id, (err, teacher) => {
        teacher.myStudents.pull(req.params.id);
        teacher.save();
    });
    Student.findByIdAndDelete(req.params.id, (err) => {
        if(err){
            console.log(err);
        }
        return res.redirect('/teachers/manage');
    });
});

router.get('/teachers/manage/:id/resetpassword', middleware.isLoggedIn, (req, res) => {
    var query = {_id: req.params.id}
    Student.findOne(query, (err, foundStudent) => {
        if(err){
            console.log(err);
        }
        else {
            res.render('teacher/resetpassword', {student: foundStudent});
        }
    });
});

router.put('/teachers/manage/:id/resetpassword', middleware.isLoggedIn, (req, res) => {
    var query = {_id: req.params.id}
    Student.findOne(query, (err, foundStudent) => {
        foundStudent.password = req.body.password;
        var email = foundStudent.email;
        Student.resetPassword(foundStudent, function(err, user){
            if(err) throw err;
        });
        const data = `
                <div style="width: 450px; border: 2px dotted black; padding: 30px; font-family: Cambria, Cochin, Georgia, Times, 'Times New Roman', serif;">
                    <h1 style="text-align: center; text-decoration: underline;">Student Overview System</h1>
                    <h3 style="padding-top: 10px;">You're Password was reset Successfully!</h3>
                    <p><strong>Note: </strong>For new password contact admin</p>
                    <a href="https://ancient-oasis-06214.herokuapp.com/students/login">Click Here To Login</a>
                </div>
                `;
        let mailOptions = {
            from: 'Developer@StudentOverviewSystem.com',
            to: email,
            subject: 'Password Reset Succesful',
            html: data
        }
        transporter.sendMail(mailOptions, (err, data) => {
            if(err){
                console.log(err);
            } else {
                console.log("Sent!")
            }
        });
        req.flash("success", "Password Reset Successfully!")
        res.redirect('/teachers/manage');
    });
});

router.get('/teachers/addtest', middleware.isLoggedIn, (req, res) => {
    res.render('teacher/addtest');
});

router.post('/teachers/addtest', middleware.isLoggedIn, upload.single('file'), (req, res) => {
    if(req.fileValidationError) {
        req.flash('error', 'Only .doc, .docx, .pdf, .txt files are allowed')
        return res.redirect('back')
  }
    Teacher.findById(req.user._id, (err, teacher) => {
        teacher.myTests.push(req.file.id);
        teacher.save();
    });
    req.flash('success', 'Test Upload Successfull'); 
    res.redirect('/teachers');
});

router.get('/teachers/managetest', middleware.isLoggedIn, (req, res) => {
    const filesToShow = [];
    gfs.files.find().toArray((err, files) => {
        if(!files || files.length === 0) {
            res.render('teacher/managetest', {files: false});
        } else {
            files.forEach(function(file){
                // console.log("<======================================>")
                var s = JSON.stringify(file.metadata.id);
                if(s == "\""+req.user._id+"\""){
                    filesToShow.push(file);
                }
            });
            res.render('teacher/managetest', {files: filesToShow});
        }
    });
});

router.get('/teachers/managetest/viewtest/:tid', middleware.isLoggedIn, (req, res) => {
    const filesToShow = [];
    gfs.findOne({_id: req.params.tid}, (err, questionFile) => {
        Teacher.findOne({_id: req.user._id}, (err,  teacher) => {
            gfs.files.find().toArray((err, files) => {
                files.forEach(function(file){
                    if(file.metadata.type === "Answer"){
                        if(teacher.myStudents.includes(file.metadata.id)){
                            if(file.metadata.tid == req.params.tid){
                                filesToShow.push(file);
                            }
                        }
                    } else {
                    }
                });
                res.render('teacher/viewtest', {files: filesToShow, questionFile: questionFile});
            });
        });
    });
});

router.delete('/teachers/managetest/viewtest/:id', middleware.isLoggedIn, (req, res) => {
    // Finding file by params for the answer file: Params are of answer file not question file
    gfs.findOne({_id: req.params.id}, (err, file) => {
        // Finding student by metadata.id
        Student.findById(file.metadata.id, (err, student) => {
            // Removing question_id from student's array with the help of tid
            student.questions.pull(file.metadata.tid);
            student.save();
        });
    });
    gfs.remove({ _id: req.params.id, root: 'uploads' }, (err, gridStore) => {
        if (err) {
          return res.status(404).json({ err: err });
        }
        req.flash('success', 'Test deleted successfully!')
        res.redirect('back');
    });
});


router.delete('/teachers/managetest/:id', middleware.isLoggedIn, (req, res) => {
    Teacher.findById(req.user._id, (err, teacher) => {
        teacher.myTests.pull(req.params.id);
        teacher.save();
    });
    gfs.remove({ _id: req.params.id, root: 'uploads' }, (err, gridStore) => {
        if (err) {
          return res.status(404).json({ err: err });
        }
        req.flash('success', 'Test deleted successfully!')
        res.redirect('/teachers/managetest');
    });
});


router.get('/teachers/addattendance', middleware.isLoggedIn, (req, res) => {
    var date = new Date();
    date = date.toDateString();
    Teacher.findById(req.user._id).populate("myStudents").exec(function(err, foundStudent){
        if(err){
            console.log(err);
        } else {
            res.render('teacher/addattendance', {students: foundStudent, date: date});
        }
    });   
});

router.post('/teachers/addattendance/:sid/present', middleware.isLoggedIn, (req, res) => {
    Student.findById(req.params.sid, (err, foundStudent) => {
        var date = new Date();
        var date = date.toDateString();
        if(foundStudent.attendanceA.includes(date)){
            foundStudent.attendanceA.pull(date);
            foundStudent.attendanceP.push(date);
        } else {
            foundStudent.attendanceP.push(date);
        }
        foundStudent.save();
        req.flash('success', 'Attendance added');
        res.redirect('/teachers/addattendance');
    });
});

router.post('/teachers/addattendance/:sid/absent', middleware.isLoggedIn, (req, res) => {
    Student.findById(req.params.sid, (err, foundStudent) => {
        var date = new Date();
        var date = date.toDateString();
        if(foundStudent.attendanceP.includes(date)){
            foundStudent.attendanceP.pull(date);
            foundStudent.attendanceA.push(date);
        } else {
            foundStudent.attendanceA.push(date);
        }
        foundStudent.save();
        req.flash('success', 'Attendance added');
        res.redirect('/teachers/addattendance');
    });
});

router.get('/teachers/manageattendance', middleware.isLoggedIn, (req, res) => {
    var date = new Date();
    var date = date.toDateString();
    const studentsToShow = [];
    Teacher.findById(req.user._id).populate("myStudents").exec(function(err, foundStudent){
        if(err){
            console.log(err);
        } else {
            foundStudent.myStudents.forEach(function(student){
                if(student.attendanceA.length > student.attendanceP.length){
                    studentsToShow.push(student);
                }
            });
            res.render('teacher/manageattendance', {students: studentsToShow, date: date});
        }
    }); 
}); 

router.post('/teachers/manageattendance/:sid/sendemail', middleware.isLoggedIn, (req, res) => {
    var date = new Date();
    var date = date.toDateString();
    Student.findById(req.params.sid, async (err, foundStudent) => {
        var email = foundStudent.email;
        const data = `
                <div style="width: 450px; border: 2px dotted black; padding: 30px; font-family: Cambria, Cochin, Georgia, Times, 'Times New Roman', serif;">
                    <h1 style="text-align: center; text-decoration: underline;">Student Overview System</h1>
                    <h3 style="padding-top: 10px;"><strong>You're Low on Attendance</strong></h3>
                    <p><strong>Warning: </strong>Low attendance may affect your grades</p>
                    <a href="https://ancient-oasis-06214.herokuapp.com/students/login">Click Here To Login</a>
                </div>
                `;
        let mailOptions = {
            from: 'Developer@StudentOverviewSystem.com',
            to: email,
            subject: 'Low on attendance',
            html: data
        }
        await transporter.sendMail(mailOptions, (err, data) => {
            if(err){
                console.log(err);
            } else {
                console.log("Sent!")
            }
        });
        await foundStudent.attendanceEmail.push(date);
        await foundStudent.save();
        req.flash('success', 'Low Attendance Email Sent');
        res.redirect('/teachers/manageattendance');
    });
});


// <================================================= API =====================================================>

router.get('/files/:filename', middleware.isAPILoggedIn, (req, res) => {
    gfs.files.findOne({filename: req.params.filename}, (err, file) => {
        if(!file || file.length === 0) {
            res.status(404).json({
                err: 'No files exist'
            });
        }
        const readstream = gfs.createReadStream(file.filename);
        readstream.pipe(res);
    });
});



router.get('/logout', (req, res) => {
    req.logout();
    res.redirect('/index');
});

module.exports = router;