var formulario01DsServices = angular.module('formulario01DServices', ['app.services']);

formulario01DsServices.factory('Formulario01D', ['baseDataService',
	function (baseDataService) {
	    return baseDataService.getService('api/formulario', true, {
	        Consultar: { method: 'POST', url: 'api/formulario' }
	    });
	}]);
