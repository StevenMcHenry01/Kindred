const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { randomBytes } = require('crypto')
const { promisify } = require('util')

const { transport, makeANiceEmail } = require('../mail')

const Mutations = {
  async signup(parent, args, ctx, info) {
    args.email = args.email.toLowerCase()
    // hash password and generate salt (allows for multiple of same password to have different hashes)
    const password = await bcrypt.hash(args.password, 10)
    // create user in the database
    const user = await ctx.db.mutation.createUser(
      {
        data: {
          // spread args (same as email: arg.email etc.)
          ...args,
          // overwrite with hashed password
          password,
          // default permission to USER
          permissions: { set: ['USER'] },
        },
      },
      info
    )
    // create JWT webtoken to auto singin after account creation
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET)
    // set jwt as a cookie on the response (allows for cookie to come along for the ride when changing pages)
    ctx.response.cookie('token', token, {
      // wont allow javascript to access cookie
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year cookie
    })
    // return user to browser
    return user
  },

  async signin(parent, args, ctx, info) {
    const { email, password } = args
    // 1. check if there is a user with that email
    const user = await ctx.db.query.user({ where: { email } })
    if (!user) {
      throw new Error(`No such user found for email: ${email}`)
    }
    // 2. check if their password is correct
    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      throw new Error(`Invalid Password!`)
    }
    // 3. generate jwt token
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET)
    // 4. set the cookie with the token
    ctx.response.cookie('token', token, {
      // wont allow javascript to access cookie
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year cookie
    })
    // 5. return user
    return user
  },

  signout(parent, args, ctx, info) {
    ctx.response.clearCookie('token')
    return { message: 'Goodbye!' }
  },

  async requestReset(parent, args, ctx, info) {
    //1. Check if this is a real user
    const user = await ctx.db.query.user({ where: { email: args.email } })
    if (!user) {
      throw new Error(`No such user found for email: ${args.email}`)
    }
    //2. Set a rest token and expiry on that user
    const randomBytesPromisified = promisify(randomBytes)
    const resetToken = (await randomBytesPromisified(20)).toString('hex')
    const resetTokenExpiry = Date.now() + 3600000 // 1 hour from now
    const res = await ctx.db.mutation.updateUser({
      where: { email: args.email },
      data: { resetToken, resetTokenExpiry },
    })
    //3. Email them the reset token
    const mailRes = await transport.sendMail({
      from: 'stevenmchenry01@gmail.com',
      to: user.email,
      subject: 'Your Password Reset Token',
      html: makeANiceEmail(
        `Your Password Reset Token is here! \n\n <a href="${
          process.env.FRONTEND_URL
        }/reset?resetToken=${resetToken}">Click Here to Reset Password</a>`
      ),
    })
    //4. return the message
    return { message: 'Thanks!' }
  },

  async resetPassword(parent, args, ctx, info) {
    //1. Check if the passwords match
    if (args.password !== args.confirmPassword) {
      throw new Error('Oops! Passwords do not match.')
    }
    console.log(args)
    //2. Check if its a legit reset token
    //3. Check if its expired
    const [user] = await ctx.db.query.users({
      // Destructuring first user
      where: {
        resetToken: args.resetToken,
        // makes sure it has not expired!
        resetTokenExpiry_gte: Date.now() - 3600000,
      },
    })
    if (!user) {
      throw new Error('This token is either invalid or expired :(')
    }
    //4. Hash new password
    const password = await bcrypt.hash(args.password, 10)
    //5. Save the new password to the user and remove old resetToken fields
    const updatedUser = await ctx.db.mutation.updateUser({
      where: {
        email: user.email,
      },
      data: {
        password,
        resetToken: null,
        resetTokenExpiry: null,
      },
    })
    //6. Generate JWT
    const token = jwt.sign({ userId: updatedUser.id }, process.env.APP_SECRET)
    //7. Set JWT cookie
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year cookie
    })
    //8. return the new User
    return updatedUser
  },

  async setdisorder(parent, args, ctx, info) {
    console.log(args)
    // create user in the database
    const updatedUser = await ctx.db.mutation.updateUser({
      where: {
        email: user.email,
      },
      data: {
        disorders,
      },
    })
    // return user to browser
    return updatedUser
  },
}

module.exports = Mutations
