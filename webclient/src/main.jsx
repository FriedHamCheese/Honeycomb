import { createRoot } from 'react-dom/client'
import {BrowserRouter, Routes, Route, Navigate} from 'react-router'
import Home from './Home.jsx'
import DevicePage from './DevicePage.jsx'
import Login from './Login.jsx';
import Register from './Register.jsx'
import {userSessionToken} from './globals.jsx';

const paramsForMainSideNavbar = {
  relativeLinkToHome: "/home",
};

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path='/' element={userSessionToken ? <Navigate to="/home"/> : <Navigate to="/login"/>}/>
      <Route path='/login' element={
        <Login 
          APIBaseURL="http://localhost:5001"
          baseURLForHomeRedirect="/home"
          URLToRegisterPage="/register"
        />
      }/>
      <Route path='/register' element={
        <Register
          APIBaseURL="http://localhost:5001"
          URLToLoginPage="/login"
        />
      }/>
      <Route path='/home' element={
        <Home 
          APIBaseURL="http://localhost:5001"
          selectedPage="devices" 
          baseRedirectToDeviceLink="/device/" 
          URLToLoginPage='/login'
          paramsForMainSideNavbar={paramsForMainSideNavbar}
        />
      }/>
      <Route path='device/:deviceIDStr' element={
        <DevicePage
          APIBaseURL="http://localhost:5001"
          selectedPage="devices" 
          paramsForMainSideNavbar={paramsForMainSideNavbar}
          redirectToLogin='/login'
      />}/>
    </Routes>
  </BrowserRouter>
)
