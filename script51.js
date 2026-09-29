var vendedorsServices = angular.module('precargaServices', ['app.services']);

vendedorsServices.factory('PrecargaQ', ['baseDataService',
    function (baseDataService) {
	    return baseDataService.getService('api/precarga', true, {
            obtenerPrecarga: { method: 'GET', url: 'api/precarga/:numeroPrecarga', params: { numeroPrecarga: '@numeroPrecarga', dominio: '@dominio', captchaKey: '@captchaKey', captchaText: '@captchaText' } }
	    });
    }]);


var precargaServices = angular.module('prcrgServices', ['app.services']);

precargaServices.factory('PrCrg', ['baseDataService',
    function (baseDataService) {
        return baseDataService.getService('api/precarga', true, {
            obtenerPrecarga: { method: 'GET', url: 'api/precarga/:numeroPrecarga', params: { numeroPrecarga: '@numeroPrecarga', dominio: '@dominio', captchaKey: '@captchaKey', captchaText: '@captchaText' } }
        });
    }]);