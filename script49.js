var homesServices = angular.module('homeServices', ['app.services']);

homesServices.factory('home', ['baseDataService',
	function (baseDataService) {
	    return baseDataService.getService('api/bien', true, {
            verificar: { method: 'POST', url: 'api/bien/validarDominio' }
	    });
	}]);
