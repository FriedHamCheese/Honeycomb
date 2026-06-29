import {BrowserRouter, Routes, Route, Navigate, useNavigate} from 'react-router'
import {useState, useEffect} from 'react';

import Home from './Home.jsx'
import DevicePage from './DevicePage.jsx'
import Login from './Login.jsx';
import Register from './Register.jsx'
import {SelectedPageEnums} from './mainSideNavbar.jsx';

const paramsForMainSideNavbar = {
  relativeLinkToHome: "/home",
};

export default function App(){
  const getUserSessionToken = function (){
    return sessionStorage.getItem("userSessionToken");
  };
  const setUserSessionToken = function (userSessionToken) {
    sessionStorage.setItem("userSessionToken", userSessionToken);
  }
  const removeUserSessionToken = function (){
    sessionStorage.removeItem("userSessionToken");
  }
  
  const APIBaseURL = "http://localhost:5001";
  
  return (
    <BrowserRouter>
      <Routes>
        <Route path='/' element={
          getUserSessionToken() ? <Navigate to="/home"/> : <Navigate to="/login"/>
        }/>
        <Route path='/login' element={
          <Login 
            APIBaseURL={APIBaseURL}
            URLToHomePage="/home"
            URLToRegisterPage="/register"
            setUserSessionToken={setUserSessionToken}
            getUserSessionToken={getUserSessionToken}
          />
        }/>
        <Route path='/register' element={
          <Register
            APIBaseURL={APIBaseURL}
            URLToLoginPage="/login"
          />
        }/>
        <Route path='/home' element={
          <Home 
            APIBaseURL={APIBaseURL}
            selectedPage={SelectedPageEnums.DEVICE}
            baseURLToDevicePage="/device/" 
            URLToLoginPage='/login'
            paramsForMainSideNavbar={paramsForMainSideNavbar}
            getUserSessionToken={getUserSessionToken}
            clearUserSessionToken={removeUserSessionToken}
          />
        }/>
        <Route path='device/:deviceIDStr' element={
          <DevicePage
            APIBaseURL={APIBaseURL}
            selectedPage={SelectedPageEnums.DEVICE}
            paramsForMainSideNavbar={paramsForMainSideNavbar}
            URLToLoginPage='/login'
            getUserSessionToken={getUserSessionToken}
            clearUserSessionToken={removeUserSessionToken}
        />}/>
      </Routes>
    </BrowserRouter>
  );
}