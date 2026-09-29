var tramitesDigitalesServices = angular.module('tramitesDigitalesServices', ['app.services']);

tramitesDigitalesServices.factory('digitales', 
    function () {
        var tramitesDigitalesRelacionNormales = [
            { normal: '022009', digital: '022055' },
            { normal: '022010', digital: '022056' },
            { normal: '022014', digital: '022054' },
            { normal: '022012', digital: '022051' },
            { normal: '022015', digital: '022052' },
            { normal: '022021', digital: '022053' },
            { normal: '030000', digital: '030999' }
        ];

        return {
            all: function () {
                return tramitesDigitalesRelacionNormales;
            },
            get: function (obj) {
                return tramitesDigitalesRelacionNormales.filter(function (e) { return e.normal === obj || e.digital === obj; })[0];
            },
            esUnTramiteDigital: function (obj) {
                return tramitesDigitalesRelacionNormales.filter(function (e) { return e.digital === obj; }).length > 0;
            },
            esUnTramiteConOpcionDigital: function (obj) {
                return tramitesDigitalesRelacionNormales.filter(function (e) { return e.normal === obj; }).length > 0;
            },
            obtenerTramiteDigitalApartirDelNormal: function (obj) {
                return tramitesDigitalesRelacionNormales.filter(function (e) { return e.normal === obj; });
            }
        };
    });
